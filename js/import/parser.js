const DEPARTMENT_LABELS = {
  CSE: 'B.Sc. in Computer Science and Engineering (CSE)',
  EEE: 'BSc EEE — Electrical & Electronic Engineering',
  BBA: 'Bachelor of Business Administration (BBA)',
  ECO: 'B.S.S. in Economics (ECO)',
  ENG: 'B.A. in English (ENG)',
  ARC: 'B.Arch. in Architecture (ARC)',
  PHR: 'B.Sc. in Pharmacy (PHR)',
  LAW: 'Bachelor of Laws (LLB)',
  CS: 'B.Sc. in Computer Science (CS)',
  ECE: 'B.Sc. in Electronic & Communication Engineering (ECE)',
  ANT: 'B.S.S. in Anthropology (ANT)',
  PHY: 'B.Sc. in Physics (PHY)',
  APE: 'B.Sc. in Applied Physics & Electronics (APE)',
  MAT: 'B.Sc. in Mathematics (MAT)',
  MIC: 'B.Sc. in Microbiology (MIC)',
  BIO: 'B.Sc. in Biotechnology (BIO)',
};

const PROGRAM_DETECTORS = [
  [DEPARTMENT_LABELS.CSE, /COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING|\bCSE\b/i],
  [DEPARTMENT_LABELS.CS, /COMPUTER\s+SCIENCE(?!\s+AND\s+ENGINEERING)|\bCS\b/i],
  [DEPARTMENT_LABELS.EEE, /ELECTRICAL\s*(?:&|AND)\s*ELECTRONIC\s+ENGINEERING|\bBSC\s*EEE\b|\bEEE\b/i],
  [DEPARTMENT_LABELS.ECE, /ELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING|\bECE\b/i],
  [DEPARTMENT_LABELS.BBA, /BUSINESS\s+ADMINISTRATION|\bBBA\b/i],
  [DEPARTMENT_LABELS.ECO, /ECONOMICS|\bECO\b/i],
  [DEPARTMENT_LABELS.ENG, /ENGLISH|\bENG\b/i],
  [DEPARTMENT_LABELS.ARC, /ARCHITECTURE|\bARCH\b|\bARC\b/i],
  [DEPARTMENT_LABELS.PHR, /PHARMACY|\bPHR\b/i],
  [DEPARTMENT_LABELS.LAW, /BACHELOR\s+OF\s+LAWS|\bLL\.?B\b|\bLAW\b/i],
  [DEPARTMENT_LABELS.ANT, /ANTHROPOLOGY|\bANT\b/i],
  [DEPARTMENT_LABELS.APE, /APPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS|\bAPE\b/i],
  [DEPARTMENT_LABELS.PHY, /PHYSICS(?!\s*(?:&|AND)\s*ELECTRONICS)|\bPHY\b/i],
  [DEPARTMENT_LABELS.MAT, /MATHEMATICS|\bMAT\b/i],
  [DEPARTMENT_LABELS.MIC, /MICROBIOLOGY|\bMIC\b/i],
  [DEPARTMENT_LABELS.BIO, /BIOTECHNOLOGY|\bBIO\b/i],
];

const TEXT_DETECTORS = [
  [DEPARTMENT_LABELS.CSE, /\bB\.?\s*SC\.?\s+IN\s+COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING\b|COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING|\bCSE\b/i],
  [DEPARTMENT_LABELS.EEE, /\bBSC\s*EEE\b|\bELECTRICAL\s*(?:&|AND)\s*ELECTRONIC\s+ENGINEERING\b/i],
  [DEPARTMENT_LABELS.BBA, /\bBACHELOR\s+OF\s+BUSINESS\s+ADMINISTRATION\b|\bBBA\b/i],
  [DEPARTMENT_LABELS.ECO, /\bB\.?\s*S\.?\s*S\.?\s+IN\s+ECONOMICS\b|\bSOCIAL\s+SCIENCE.*ECONOMICS\b/i],
  [DEPARTMENT_LABELS.ENG, /\bB\.?\s*A\.?\s+IN\s+ENGLISH\b|\bBACHELOR\s+OF\s+ARTS\s+IN\s+ENGLISH\b/i],
  [DEPARTMENT_LABELS.ARC, /\bB\.?\s*ARCH\.?\b|\bBACHELOR\s+OF\s+ARCHITECTURE\b/i],
  [DEPARTMENT_LABELS.PHR, /\bB\.?\s*SC\.?\s+IN\s+PHARMACY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+PHARMACY\b/i],
  [DEPARTMENT_LABELS.LAW, /\bBACHELOR\s+OF\s+LAWS\b|\bLL\.?B\b/i],
  [DEPARTMENT_LABELS.CS, /\bB\.?\s*SC\.?\s+IN\s+COMPUTER\s+SCIENCE\b(?!\s+AND\s+ENGINEERING)|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+COMPUTER\s+SCIENCE\b(?!\s+AND\s+ENGINEERING)/i],
  [DEPARTMENT_LABELS.ECE, /\bB\.?\s*SC\.?\s+IN\s+ELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING\b|\bELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING\b/i],
  [DEPARTMENT_LABELS.ANT, /\bB\.?\s*S\.?\s*S\.?\s+IN\s+ANTHROPOLOGY\b|\bBACHELOR\s+OF\s+SOCIAL\s+SCIENCE\s+IN\s+ANTHROPOLOGY\b/i],
  [DEPARTMENT_LABELS.APE, /\bB\.?\s*SC\.?\s+IN\s+APPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS\b|\bAPPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS\b/i],
  [DEPARTMENT_LABELS.PHY, /\bB\.?\s*SC\.?\s+IN\s+PHYSICS\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+PHYSICS\b/i],
  [DEPARTMENT_LABELS.MAT, /\bB\.?\s*SC\.?\s+IN\s+MATHEMATICS\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+MATHEMATICS\b/i],
  [DEPARTMENT_LABELS.MIC, /\bB\.?\s*SC\.?\s+IN\s+MICROBIOLOGY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+MICROBIOLOGY\b/i],
  [DEPARTMENT_LABELS.BIO, /\bB\.?\s*SC\.?\s+IN\s+BIOTECHNOLOGY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+BIOTECHNOLOGY\b/i],
];

function detectDepartment(text) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return null;

  const programMatch = compact.match(
    /PROGRAM:\s*(.+?)(?=SEMESTER:|COURSE\s+NO|COURSE\s+TITLE|CREDITS\s+EARNED|GRADE\s+POINTS|GRADE\s+SHEET|STUDENT\s+ID|NAME\b|$)/i
  );
  const programText = programMatch ? programMatch[1].trim() : '';

  if (programText) {
    for (const [label, pattern] of PROGRAM_DETECTORS) {
      if (pattern.test(programText)) return label;
    }
  }

  for (const [label, pattern] of TEXT_DETECTORS) {
    if (pattern.test(compact)) return label;
  }

  return null;
}

function normalizeTranscriptLine(line) {
  let normalized = String(line || '').replace(/\u00a0/g, ' ').trim();
  if (!normalized) return '';

  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/^(SEMESTER|PROGRAM)\s*:\s*/i, '$1: ');
  normalized = normalized.replace(/\b(SPRING|SUMMER|FALL)(\d{4})\b/gi, '$1 $2');
  normalized = normalized.replace(/^([A-Z]{2,4}\d{3}[A-Z]?)(?=[A-Z])/, '$1 ');
  normalized = normalized.replace(/([A-Za-z\)])(?=\d+\.\d+)/g, '$1 ');
  normalized = normalized.replace(/(\d+\.\d+)(?=F\s*\(\s*NT\s*\)|[A-Z][+-]?)/g, '$1 ');
  normalized = normalized.replace(/(F\s*\(\s*NT\s*\)|[A-Z][+-]?)(?=\d+\.\d+)/g, '$1 ');
  normalized = normalized.replace(/F\s*\(\s*NT\s*\)/gi, 'F(NT)');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function normalizeTranscriptText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(normalizeTranscriptLine)
    .join('\n');
}

// ── parseBlobFallback ─────────────────────────────────────────────────────────
export function parseBlobFallback(text) {
  const normalizedText = normalizeTranscriptText(text);
  const blob = normalizedText.replace(/\s+/g, ' ');
  const SEASON = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const semRe  = /SEMESTER[:\s]+([A-Z]+)\s*(\d{4})/gi;
  const semMatches = [];
  let sm;
  while ((sm = semRe.exec(blob)) !== null) {
    const season = sm[1].toUpperCase();
    const year   = sm[2];
    semMatches.push({ name: `${SEASON[season] || sm[1]} ${year}`, season, year, idx: sm.index });
  }
  if (!semMatches.length) return { semesters: [], detectedDept: null };

  const courseRe = /\b([A-Z]{2,4}\d{3}[A-Z]?)\b(.{1,120}?)\b(\d+\.\d+)\s+((?:[A-Z][+-]?)(?:\((?:NT|RT)\))|[A-Z][+-]?)\s+(\d+\.\d+)/g;
  const semesters = semMatches.map((s, idx) => {
    const sliceEnd = idx + 1 < semMatches.length ? semMatches[idx+1].idx : blob.length;
    const slice    = blob.slice(s.idx, sliceEnd);
    const courses  = [];
    let   cm;
    while ((cm = courseRe.exec(slice)) !== null) {
      const code  = cm[1];
      const title = (cm[2] || '').trim().replace(/\s{2,}/g, ' ');
      const creds = parseFloat(cm[3]);
      const grade = cm[4].replace(/\(RT\)/,'').trim();
      const gp    = parseFloat(cm[5]);
      if (!isNaN(creds) && creds > 0) {
        courses.push({ name: `${code} ${title}`.trim(), credits: creds, grade, gradePoint: gp });
      }
    }
    courseRe.lastIndex = 0;
    return { id: Date.now() + idx, name: s.name, courses, running: false };
  }).filter(s => s.courses.length > 0);

  return { semesters, detectedDept: detectDepartment(normalizedText) };
}

// ── parseTranscriptText ───────────────────────────────────────────────────────
// BRACU PDFs (via pdf.js) render in column order:
//   • All semester blocks (codes + titles) appear first, each followed by
//     semester/cumulative credit totals (which we skip)
//   • Then ALL individual course credits in one contiguous block
//   • Then ALL grades in one contiguous block
//   • Then ALL grade points in one contiguous block
export function parseTranscriptText(text) {
  const normalizedText = normalizeTranscriptText(text);
  const lines = normalizedText.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Dept detection ────────────────────────────────────────────────────────
  const detectedDept = detectDepartment(normalizedText);

  const SEASON_NAMES = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const semRe    = /^SEMESTER:\s*([A-Z]+)\s*(\d{4})\b/i;
  const codeRe   = /^([A-Z]{2,4}\d{3}[A-Z]?)$/;
  // Detects a course code at the start of a line merged with credits data.
  // This happens when pdf.js joins a code with credits/grade/GP that share
  // the same y-coordinate (multi-line course title rows in BRACU PDFs).
  // Supports merged forms where pdf.js outputs:
  //   - "MAT120  3.00  B  3.00"
  //   - "MAT1103.00B3.00"  (note the credit may start with ".00" immediately)
  const codeStartRe = /^([A-Z]{2,4}\d{3}[A-Z]?)(?:\s*(?:\d|\.\d))/;
  const numberRe = /^\d+\.\d+$/;
  const gradeRe  = /^([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)$/;
  // Lines to skip entirely in pass 1
  const skipRe   = /^(SEMESTER\b(?!:)|CUMULATIVE\s+Credits|Credits\s+(Attempted|Earned)|GPA$|CGPA$|BRAC\s+University|Kha\s+224|Merul|GRADE\s+SHEET|UNOFFICIAL|Student\s+ID|^Name$|Course\s+No|Course\s+Title|UNDERGRADUATE|PROGRAM:|Page\s+\d|Credits\s+Earned\s+Grade|Grade\s+Points)/i;

  // ── Pass 1: collect semester codes + titles (ignore all numbers) ──────────
  const sems = [];
  let curSem = null;

  // Track last title extension for multi-line title un-appending.
  // When a title overflow line is wrongly appended to the previous course's
  // title, and we later discover the real code (merged with data), we need
  // to undo the append and reassign the text as the new code's title.
  let lastExtText = null;   // the text that was appended
  let lastExtIdx  = -1;     // which title index it was appended to
  let lastExtOrigLen = 0;   // title length before the extension was added

  for (const line of lines) {
    if (skipRe.test(line))   continue;   // skip junk header/footer lines
    if (numberRe.test(line)) continue;   // skip all standalone numbers
    if (gradeRe.test(line))  continue;   // skip stray grade tokens

    const sm = line.match(semRe);
    if (sm) {
      const season = sm[1].toUpperCase();
      curSem = {
        name: `${SEASON_NAMES[season] || sm[1]} ${sm[2]}`,
        codes: [], titles: [],
      };
      sems.push(curSem);
      lastExtText = null; lastExtIdx = -1;
      continue;
    }
    if (!curSem) continue;

    const cm = line.match(codeRe);
    if (cm) {
      curSem.codes.push(cm[1]);
      lastExtText = null; lastExtIdx = -1; // reset — normal standalone code
      continue;
    }

    // Check for course code merged with credits data on the same line.
    // In BRACU PDFs, multi-line course titles cause the code to share a
    // y-coordinate with the credits/grade/GP columns, so pdf.js joins
    // them into one line like "MAT1103.00B3.00" or "MAT120  3.00  B  3.00".
    const cmStart = line.match(codeStartRe);
    if (cmStart) {
      curSem.codes.push(cmStart[1]);
      // The last title extension was actually the START of this code's title.
      // Un-append it from the previous title and assign it to the new code.
      if (lastExtText !== null && lastExtIdx >= 0 && lastExtIdx < curSem.titles.length) {
        curSem.titles[lastExtIdx] = curSem.titles[lastExtIdx].substring(0, lastExtOrigLen);
        curSem.titles.push(lastExtText);
      }
      lastExtText = null; lastExtIdx = -1;
      continue;
    }

    // Title line — pair with latest unmatched code, or extend previous title
    if (!line[0].match(/\d/)) {
      if (curSem.titles.length < curSem.codes.length) {
        curSem.titles.push(line);
        lastExtText = null; lastExtIdx = -1; // fresh title, not an extension
      } else if (curSem.titles.length > 0) {
        // Extension — track it so we can un-append if it turns out to be
        // the start of a new title for a code that hasn't been seen yet.
        lastExtOrigLen = curSem.titles[curSem.titles.length - 1].length;
        lastExtText = line;
        lastExtIdx = curSem.titles.length - 1;
        curSem.titles[curSem.titles.length - 1] += ' ' + line;
      }
    }
  }

  const semCounts = sems.map(s => s.codes.length);
  const totalCourses = semCounts.reduce((a, b) => a + b, 0);
  if (totalCourses === 0) return _legacyParseTranscript(lines, detectedDept);

  // ── Find where the individual-course credits block begins ─────────────────
  // It starts immediately after the LAST "Credits Earned" line that precedes
  // the contiguous block of per-course decimals.
  let creditsBlockStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^Credits\s+Earned\b/i.test(lines[i])) {
      // Confirm one of the next few lines starts the decimals block.
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        if (numberRe.test(lines[j])) {
          creditsBlockStart = j;
          break;
        }
      }
      if (creditsBlockStart >= 0) break;
    }
  }
  if (creditsBlockStart < 0) return _legacyParseTranscript(lines, detectedDept);

  // ── Collect raw numbers/grades/gp from creditsBlockStart onwards ──────────
  const creditsRaw = [];
  const gradesRaw  = [];
  const gpRaw      = [];
  let phase = 'credits'; // credits -> grades -> gp

  for (let i = creditsBlockStart; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'GPA' || line === 'CGPA') continue;

    if (phase === 'credits') {
      if (numberRe.test(line)) { creditsRaw.push(parseFloat(line)); continue; }
      if (gradeRe.test(line))  { phase = 'grades'; /* fall through */ }
    }
    if (phase === 'grades') {
      if (numberRe.test(line)) { phase = 'gp'; gpRaw.push(parseFloat(line)); continue; }
      if (gradeRe.test(line)) {
        let g = line.trim().replace(/\s+/g, '');
        if (/F.*NT/i.test(line))  g = 'F(NT)';
        else if (/\(RT\)/i.test(line)) g = g.replace('(RT)', '').trim();
        gradesRaw.push(g);
        continue;
      }
    }
    if (phase === 'gp') {
      if (numberRe.test(line)) { gpRaw.push(parseFloat(line)); continue; }
    }
  }

  // ── Extract per-course values by skipping 2 semester totals after each N ──
  function extractCourseValues(raw, counts) {
    const out = [];
    let pos = 0;
    for (const n of counts) {
      for (let k = 0; k < n; k++) {
        out.push(raw[pos] !== undefined ? raw[pos] : null);
        pos++;
      }
      pos += 2; // skip semester total + cumulative total
    }
    return out;
  }

  const allCredits = extractCourseValues(creditsRaw, semCounts);
  const allGP      = extractCourseValues(gpRaw,      semCounts);
  // Grades column doesn't have semester totals interspersed (already stripped GPA/CGPA)
  // so gradesRaw is already flat
  const allGrades  = gradesRaw;

  // ── Assemble final semesters ──────────────────────────────────────────────
  const semesters = [];
  let flat = 0;
  for (const sem of sems) {
    const courses = [];
    for (let k = 0; k < sem.codes.length; k++) {
      const code       = sem.codes[k];
      const title      = sem.titles[k] || '';
      const name       = title ? `${title} (${code})` : code;
      const credits    = allCredits[flat] !== null ? allCredits[flat]  : 0;
      const grade      = allGrades[flat]  !== undefined ? allGrades[flat] : '';
      const gradePoint = allGP[flat]      !== null ? allGP[flat]      : '';
      courses.push({ name, credits, grade, gradePoint });
      flat++;
    }
    if (courses.length > 0) {
      semesters.push({
        id: Date.now() + semesters.length,
        name: sem.name,
        courses,
        running: false,
      });
    }
  }

  if (semesters.length === 0) return _legacyParseTranscript(lines, detectedDept);
  return { semesters, detectedDept };
}

// ── _legacyParseTranscript — fallback for non-column-format PDFs ──────────────
function _legacyParseTranscript(lines, detectedDept) {
  const SEASON_NAMES = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const semRe      = /^SEMESTER[:\s]*([A-Z]+)\s*(\d{4})\b/i;
  const skipRe     = /^(SEMESTER|CUMULATIVE)\s+Credits|^(Credits Attempted|Credits Earned|GPA|CGPA)|^(BRAC University|Grade Sheet|Student|Name|Program|Course No)|^Page \d/i;
  const fntRe      = /F\s*\(NT\)/;
  const courseRe   = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const codeOnlyRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s+([\d]+\.[\d]+)$/;
  const codeMarkerRe = /^([A-Z]{2,4}\d{3}[A-Z]?)$/;
  // Some PDFs merge code+credits+grade+gp into one compact token stream,
  // e.g. "MAT1103.00B3.00" or "MAT120  3.00  B  3.00".
  const codeOnlyCompactRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s*([\d]+\.[\d]+)\s*([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s*([\d]+\.[\d]+)$/;
  const partialRe  = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)$/;
  const contRe     = /^([A-Za-z][A-Za-z\s&:,\(\)\-\.]*?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s+([\d]+\.[\d]+)$/;
  // Multi-line titles sometimes become:
  //   <CODE>                 (e.g. "MAT110")
  //   <TITLE line 1>
  //   <TITLE line 2>
  //   <CREDITS> <GRADE> <GP> (e.g. "3.00 B 3.00")
  const creditsGradeGpOnlyRe =
    /^([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;

  const semesters = [];
  let currentSem = null, pendingTitle = null, skipNextFrag = false;

  for (const line of lines) {
    if (skipRe.test(line)) { pendingTitle = null; skipNextFrag = false; continue; }
    const semM = line.match(semRe);
    if (semM) {
      const season = semM[1].toUpperCase();
      currentSem = { id: Date.now() + semesters.length, name: `${SEASON_NAMES[season] || semM[1]} ${semM[2]}`, courses: [], running: false };
      semesters.push(currentSem);
      pendingTitle = null; skipNextFrag = false; continue;
    }
    if (!currentSem) continue;
    if (skipNextFrag) { skipNextFrag = false; if (/^[A-Z][A-Z\s&:,\(\)\-\.]+$/.test(line)) continue; }

    // If the parser extracted just the course code as a standalone line,
    // start a pending title so we can attach later "credits grade gp" lines.
    const codeMarker = line.match(codeMarkerRe);
    if (codeMarker) {
      pendingTitle = line;
      continue;
    }

    if (fntRe.test(line)) {
      const code = line.trim().split(/\s+/)[0];
      if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) {
        const credM = line.match(/\b(\d+\.\d+)\b/);
        currentSem.courses.push({ name: code, credits: credM ? parseFloat(credM[1]) : 0, grade: 'F(NT)', gradePoint: 'NT' });
        pendingTitle = null; continue;
      }
    }
    if (pendingTitle) {
      const cgOnly = line.match(creditsGradeGpOnlyRe);
      if (cgOnly) {
        const code2 = (pendingTitle.match(codeMarkerRe) || pendingTitle.match(/^([A-Z]{2,4}\d{3}[A-Z]?)/) || [])[1] || '';
        const tp = pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/,'').trim();

        let grade = cgOnly[2].trim().replace(/\s+/g,'');
        if (/F.*NT/i.test(cgOnly[2])) grade = 'F(NT)';
        else grade = grade.replace('(RT)','').replace('(NT)','').trim();

        currentSem.courses.push({ name: tp ? `${tp} (${code2})` : code2, credits: parseFloat(cgOnly[1]), grade, gradePoint: parseFloat(cgOnly[3]) });
        pendingTitle = null;
        continue;
      }

      const cont = line.match(contRe);
      if (cont) {
        const fullLine = pendingTitle + ' ' + line;
        const cm2 = fullLine.match(courseRe);
        if (cm2) {
          let grade = cm2[4].trim().replace(/\s+/g,'');
          if (/F.*NT/i.test(cm2[4])) grade = 'F(NT)';
          else grade = grade.replace('(RT)','').replace('(NT)','').trim();
          currentSem.courses.push({ name: cm2[1]+' '+cm2[2].trim(), credits: parseFloat(cm2[3]), grade, gradePoint: parseFloat(cm2[5]) });
          pendingTitle = null; continue;
        }
        const code2 = (pendingTitle.match(/^([A-Z]{2,4}\d{3}[A-Z]?)/) || [])[1] || pendingTitle;
        const tp = pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/,'').trim();
        let g2 = cont[3].trim().replace(/\s+/g,'').replace('(RT)','').replace('(NT)','').trim();
        if (/F.*NT/i.test(cont[3])) g2 = 'F(NT)';
        currentSem.courses.push({ name: `${(tp+' '+cont[1].trim()).trim()} (${code2})`, credits: parseFloat(cont[2]), grade: g2, gradePoint: parseFloat(cont[4]) });
        pendingTitle = null; continue;
      }
    }
    const co = line.match(codeOnlyRe);
    if (co) {
      let grade = co[3].trim().replace(/\s+/g,'');
      if (/F.*NT/i.test(co[3])) grade = 'F(NT)';
      else grade = grade.replace('(RT)','').replace('(NT)','').trim();
      const title = pendingTitle ? pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/,'').trim() : '';
      currentSem.courses.push({ name: title ? `${title} (${co[1]})` : co[1], credits: parseFloat(co[2]), grade, gradePoint: parseFloat(co[4]) });
      pendingTitle = null; skipNextFrag = true; continue;
    }
    const coc = line.match(codeOnlyCompactRe);
    if (coc) {
      let grade = coc[3].trim().replace(/\s+/g,'');
      if (/F.*NT/i.test(coc[3])) grade = 'F(NT)';
      else grade = grade.replace('(RT)','').replace('(NT)','').trim();
      const title = pendingTitle ? pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/,'').trim() : '';
      currentSem.courses.push({ name: title ? `${title} (${coc[1]})` : coc[1], credits: parseFloat(coc[2]), grade, gradePoint: parseFloat(coc[4]) });
      pendingTitle = null; skipNextFrag = true; continue;
    }
    const cm = line.match(courseRe);
    if (cm) {
      let grade = cm[4].trim().replace(/\s+/g,'');
      if (/F.*NT/i.test(cm[4])) grade = 'F(NT)';
      else grade = grade.replace('(RT)','').replace('(NT)','').trim();
      currentSem.courses.push({ name: cm[1]+' '+cm[2].trim(), credits: parseFloat(cm[3]), grade, gradePoint: parseFloat(cm[5]) });
      pendingTitle = null; continue;
    }
    const partial = line.match(partialRe);
    if (partial && !/\d+\.\d+\s*$/.test(line)) { pendingTitle = line; continue; }
    if (!line[0].match(/\d/) && line.length > 2 && line.length < 100 && !/^[A-Z]{2,4}\d{3}/.test(line))
      pendingTitle = (pendingTitle ? pendingTitle+' ' : '') + line;
    else pendingTitle = null;
  }
  return { semesters: semesters.filter(s => s.courses.length > 0), detectedDept };
}
