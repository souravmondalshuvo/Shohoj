#!/usr/bin/env python3
"""Import DIU's course lists from its official program pages.

Every undergraduate program on daffodilvarsity.edu.bd has a detail record in
DIU's public content API — the one the site's own program pages call — and
that record's `summary` is the program's curriculum: its courses in HTML
tables, with codes, titles and credits. Each department lays its tables out
its own way, so this reads them row by row rather than by position: a row is
a course when one cell is a course code; its title is the next cell with
words in it; its credits are the column the table's header calls credits, or
else the last number in the row.

What it writes:
  data/campuses/diu/program-courses.json   each program's courses, as listed
  data/campuses/diu/sources.json           one `diu-curriculum-<program>`
                                           source per program it read

Why per program, and not a campus-wide courses.json: DIU's codes are only
unique within a department. CSE212 is Discrete Mathematics in CSE and an
object-oriented programming lab in RME; MAT101 is five different courses in
five programs. A course is a code *in a program* here.

What it leaves out, and says so in the file's note and in its report:
  - programs whose codes are ISCED field codes (0413-111). Shohoj's course
    code is letters then three digits, everywhere from the campus database to
    the Worker and the Firestore rules, and widening it is its own change.
  - programs whose page lists no courses, or lists them without credits.
  - single rows that don't read cleanly (no title, credits that aren't a
    multiple of 0.5, a code listed twice with different credits).

Usage:
  python3 scripts/import_diu_curricula.py --fetch DIR   # download the records
  python3 scripts/import_diu_curricula.py DIR           # import from them

The downloaded records are not committed: the CSE record alone is 160 kB of
HTML. Re-run both steps to refresh, and review the diff.
"""

import html.parser
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://webbackend.daffodilvarsity.edu.bd/api/v1/public/'
UA = 'Mozilla/5.0 (compatible; Shohoj campus-data importer; +https://github.com/souravmondalshuvo/Shohoj)'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIU = os.path.join(ROOT, 'data', 'campuses', 'diu')

# The campus database's course code, after spaces and hyphens are dropped.
COURSE_CODE = re.compile(r'^[A-Z]{2,4}\d{3}[A-Z]{0,2}$')
LETTER = re.compile(r'^([A-Z]{2,4})\s*[-–]?\s*(\d{3})([A-Z]{0,2})$')
ISCED = re.compile(r'^\d{4}\s*[-–]\s*\d{3}[A-Z]?$')
NUMBER = re.compile(r'^\d{1,2}(\.\d{1,2})?$')
# A title cell that is really another column: a prerequisite list, "NIL", a number.
NOT_A_TITLE = re.compile(r'^(nil|none|n/?a|-+|\d+(\.\d+)?)$|^([A-Z]{2,4}\s*\d{3}\s*[,+/&]\s*)+[A-Z]{2,4}\s*\d{3}$', re.I)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def program_url(dept, slug):
    return f'{API}department/{dept}/program/{urllib.parse.quote(slug)}'


def record_path(directory, program_id):
    """Where one program's record is kept: <directory>/<id>.json. The id comes
    from DIU's API, so it is held to what DIU's ids are (digits) and can never
    name a file outside the directory."""
    text = str(program_id)
    if not re.fullmatch(r'\d{1,6}', text):
        raise ValueError(f'unexpected program id from the API: {text!r}')
    return os.path.join(directory, f'{text}.json')


def fetch(out):
    os.makedirs(out, exist_ok=True)
    listing = get(API + 'academic/programs')
    json.dump(listing, open(os.path.join(out, 'programs.json'), 'w'), ensure_ascii=False)
    for kind in listing['program_types']:
        if kind['program_type_name'] != 'Undergraduate':
            continue
        for p in kind['programs']:
            record = get(program_url(p['department_short_name'], p['slug']))
            json.dump(record, open(record_path(out, p['id']), 'w'), ensure_ascii=False)
            print('fetched', p['slug'])
            time.sleep(0.5)


# ── HTML tables → rows of cell text ─────────────────────────────────────────

class Tables(html.parser.HTMLParser):
    """Top-level tables only, each as a list of rows of cell text."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.depth, self.row, self.cell, self.span = [], 0, None, None, 1

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.tables.append([])
        elif self.depth != 1:
            return
        elif tag == 'tr':
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []
            try:
                self.span = max(1, int(dict(attrs).get('colspan') or 1))
            except ValueError:
                self.span = 1
        elif tag in ('br', 'p', 'div', 'li') and self.cell is not None:
            self.cell.append(' ')

    def handle_endtag(self, tag):
        if tag == 'table':
            self.depth = max(0, self.depth - 1)
        elif self.depth != 1:
            return
        elif tag == 'tr' and self.row is not None:
            if any(self.row):
                self.tables[-1].append(self.row)
            self.row = None
        elif tag in ('td', 'th') and self.cell is not None:
            self.row.append(re.sub(r'\s+', ' ', ''.join(self.cell)).strip())
            self.row.extend([''] * (self.span - 1))
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def tables_of(html_text):
    p = Tables()
    p.feed(html_text or '')
    return p.tables


# ── Rows → courses ──────────────────────────────────────────────────────────

def code_of(cell):
    """('letter', 'CSE115') | ('isced', None) | (None, None).

    A cell can pair a course's new and old codes ("ENG 114/ ENG 101"); the
    first is the one the page lists the course under, and is the one kept.
    """
    text = re.sub(r'\s+', ' ', cell.strip().upper())
    text = re.split(r'\s*/\s*', text)[0]
    m = LETTER.match(text)
    if m:
        return 'letter', m.group(1) + m.group(2) + m.group(3)
    if ISCED.match(text):
        return 'isced', None
    return None, None


def header_columns(row):
    """Where a header row puts the code, the title and the credits.

    Credits are one column ("Credits", "Credit Hrs", "Total Credit") or, where
    a table splits them, theory plus lab. A semester's running total ("Sem.-wise
    Credit") is never a course's credits.
    """
    low = [c.lower() for c in row]
    code = next((i for i, c in enumerate(low) if re.search(r'code|course\s*no', c)), None)
    title = next((i for i, c in enumerate(low) if re.search(r'title|name of|course name', c)), None)
    credit = theory = lab = None
    for i, c in enumerate(low):
        if 'credit' not in c or re.search(r'semester|sem\.|year|contact|wise', c):
            continue
        if 'theory' in c:
            theory = i
        elif 'lab' in c:
            lab = i
        else:
            credit = i
    split = (theory, lab) if credit is None and theory is not None and lab is not None else None
    return code, title, credit, split


def number(cell):
    """A credit value: "3", "1.5", or theory:sessional as Architecture writes it ("0:5")."""
    text = (cell or '').strip().replace(' ', '')
    if NUMBER.match(text):
        return float(text)
    m = re.match(r'^(\d{1,2}(?:\.\d)?):(\d{1,2}(?:\.\d)?)$', text)
    if m:
        return float(m.group(1)) + float(m.group(2))
    return None


def read_rows(summary):
    """Every course row in a program's summary, before any checking.

    Columns are read relative to the code cell: where a table spans its term
    cell down several rows ("1st (1-1)"), the rows under it are a cell short,
    and an absolute column would read the wrong one. A table with no header
    row takes the last number in the row as its credits.
    """
    rows = []
    carried = None
    for table in tables_of(summary):
        # A header can stand in a table of its own, above headerless tables of
        # the same shape (Architecture's "Course No. | Course Title | Credit Hrs
        # | Contact Hrs"). It carries to them, and to nothing narrower or wider.
        head = carried if carried and table and len(table[0]) == carried[4] else None
        for row in table:
            coded = [(i, k, c) for i, (k, c) in ((i, code_of(cell)) for i, cell in enumerate(row)) if k]
            if not coded:
                h = header_columns(row)
                if h[0] is not None and (h[2] is not None or h[3] is not None):
                    head = carried = (*h, len(row))
                continue
            at, kind, code = coded[0]
            if kind == 'isced':
                rows.append({'kind': 'isced'})
                continue

            def cell(col):
                i = at + (col - head[0])
                return row[i] if 0 <= i < len(row) else None

            title = cell(head[1]) if head and head[1] is not None else None
            if not title or code_of(title)[0]:
                title = next((c for c in row[at + 1:] if re.search(r'[A-Za-z]{3}', c) and not code_of(c)[0]), None)
            credits = None
            if head is not None and head[2] is not None:
                credits = number(cell(head[2]))
            elif head is not None:
                parts = [number(cell(col)) for col in head[3]]
                credits = sum(v or 0 for v in parts) if any(v is not None for v in parts) else None
            if credits is None and (head is None or head[3] is None):
                # No header, or one whose columns don't line up with the rows
                # (ESDM's header names the title column "Course Code").
                credits = next((v for v in (number(c) for c in reversed(row[at + 1:])) if v is not None), None)
            rows.append({'kind': 'letter', 'code': code, 'title': title, 'credits': credits})
    return rows


def clean_title(title):
    title = re.sub(r'\s+', ' ', title).strip(' .:-–')
    return title


def related_titles(a, b):
    """Two wordings of one title: equal, or one inside the other, once spacing and
    punctuation go ("Physics: Modern Physics, …" and "Physics : Modern Physics, …")."""
    ka, kb = (re.sub(r'[^a-z0-9]', '', t.lower()) for t in (a, b))
    return ka in kb or kb in ka


def courses_of(summary):
    """(courses, report) for one program."""
    report = {'isced': 0, 'rows': 0, 'dropped': [], 'conflicts': []}
    by_code = {}
    for r in read_rows(summary):
        if r['kind'] == 'isced':
            report['isced'] += 1
            continue
        report['rows'] += 1
        code, title, credits = r['code'], r['title'], r['credits']
        if not COURSE_CODE.match(code):
            report['dropped'].append(f'{code}: not a course code here')
            continue
        if not title or NOT_A_TITLE.match(title.strip()):
            report['dropped'].append(f'{code}: no title')
            continue
        if credits is None or credits <= 0 or credits > 12 or credits * 2 != int(credits * 2):
            report['dropped'].append(f'{code}: credits {credits!r}')
            continue
        title = clean_title(title)
        seen = by_code.get(code)
        if seen is None:
            by_code[code] = {'code': code, 'title': title, 'credits': credits}
        elif seen['credits'] != credits:
            report['conflicts'].append(f"{code}: {seen['credits']} and {credits} credits")
            seen['conflict'] = True
        elif not related_titles(seen['title'], title):
            # One code, two courses on one page (Architecture lists ARCH211 as
            # both Physical Planning Fundamentals and Green Architecture).
            report['conflicts'].append(f"{code}: '{seen['title']}' and '{title}'")
            seen['conflict'] = True
    courses = [c for c in by_code.values() if not c.get('conflict')]
    return sorted(courses, key=lambda c: c['code']), report


# ── Programs ────────────────────────────────────────────────────────────────

def norm_name(name):
    return re.sub(r'[^a-z]', '', name.lower())


def main(src):
    programs = json.load(open(os.path.join(DIU, 'programs.json')))['records']
    ours = {norm_name(p['name']): p['code'] for p in programs}
    listing = json.load(open(os.path.join(src, 'programs.json')))
    retrieved = time.strftime('%Y-%m-%d', time.gmtime(os.path.getmtime(os.path.join(src, 'programs.json'))))

    records, sources, loaded, left_out = [], [], [], []
    for kind in listing['program_types']:
        if kind['program_type_name'] != 'Undergraduate':
            continue
        for p in kind['programs']:
            code = ours.get(norm_name(p['name']))
            if code is None:
                left_out.append((p['name'], 'not in programs.json'))
                continue
            record = json.load(open(record_path(src, p['id'])))
            courses, rep = courses_of((record.get('program') or {}).get('summary'))
            source = f'diu-curriculum-{code.lower()}'
            if rep['isced'] > rep['rows']:
                left_out.append((code, f"codes are ISCED field codes ({rep['isced']} rows like 0413-111)"))
                continue
            if len(courses) < 15:
                left_out.append((code, f'{len(courses)} courses read: the page lists too few, or lists them without credits'))
                continue
            if rep['dropped'] and len(rep['dropped']) > 0.1 * rep['rows']:
                left_out.append((code, f"{len(rep['dropped'])} of {rep['rows']} rows do not read cleanly"))
                continue
            loaded.append((code, len(courses), rep))
            sources.append({
                'id': source,
                'status': 'official',
                'title': f"{p['name']}: course distribution on DIU's program page",
                'url': program_url(p['department_short_name'], p['slug']),
                'retrieved': retrieved,
            })
            for c in courses:
                records.append({'program': code, 'code': c['code'], 'title': c['title'],
                                'credits': int(c['credits']) if c['credits'] == int(c['credits']) else c['credits'],
                                'source': source})

    left_out.sort()
    note = (
        "Each program's courses as its page on daffodilvarsity.edu.bd lists them. Codes are only unique "
        'within a department at DIU (CSE212 is Discrete Mathematics in CSE and a lab in RME), so a course '
        'is a code in a program. Codes are written without spaces or hyphens (CSE-115 and CSE 115 are '
        'CSE115). Elective slots (CSE-***) are not courses and are left out. Programs not here, and why: '
        + '; '.join(f'{c}: {why}' for c, why in left_out)
        + '. Generated by scripts/import_diu_curricula.py; do not edit by hand.'
    )
    out = {'note': note, 'records': records}
    with open(os.path.join(DIU, 'program-courses.json'), 'w') as f:
        f.write('{\n  "note": ' + json.dumps(note, ensure_ascii=False) + ',\n  "records": [\n')
        f.write(',\n'.join('    ' + json.dumps(r, ensure_ascii=False) for r in records))
        f.write('\n  ]\n}\n')

    # sources.json: one record per line, as it is written by hand. Replace this
    # importer's records and leave every other one as it was.
    path = os.path.join(DIU, 'sources.json')
    text = open(path).read()
    lines = [ln for ln in text.split('\n') if '"id": "diu-curriculum-' not in ln]
    text = '\n'.join(lines)
    head, tail = text.rsplit('\n  ]', 1)
    head = head.rstrip().rstrip(',')
    head += ',\n' + ',\n'.join('    ' + json.dumps(s, ensure_ascii=False) for s in sources)
    open(path, 'w').write(head + '\n  ]' + tail)

    print(f'{len(records)} courses in {len(loaded)} programs')
    for code, n, rep in loaded:
        extra = []
        if rep['dropped']:
            extra.append(f"dropped {len(rep['dropped'])}: {', '.join(rep['dropped'][:4])}")
        if rep['conflicts']:
            extra.append(f"conflicting {len(rep['conflicts'])}: {', '.join(rep['conflicts'][:4])}")
        print(f'  {code:8} {n:3}  {"; ".join(extra)}')
    print('left out:')
    for code, why in left_out:
        print(f'  {code:8} {why}')
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == '--fetch':
        fetch(args[1])
    elif len(args) == 1:
        main(args[0])
    else:
        print(__doc__.split('Usage:')[1].split('\n\n')[0])
        sys.exit(2)
