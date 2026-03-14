// ── parseBlobFallback ─────────────────────────────────────────────────────────
export function parseBlobFallback(text) {
  const blob = text.replace(/\s+/g, ' ');
  const SEASON = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const semRe  = /SEMESTER[:\s]+([A-Z]+)\s+(\d{4})/gi;
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

  let detectedDept = null;
  if (/CSE|COMPUTER SCIENCE/i.test(text))              detectedDept = 'BSc CSE — Computer Science & Engineering';
  else if (/ELECTRICAL/i.test(text))                   detectedDept = 'BSc EEE — Electrical & Electronic Engineering';
  else if (/BBA|BUSINESS ADMINISTRATION/i.test(text))  detectedDept = 'BBA — Business Administration';
  else if (/PHARMACY/i.test(text))                     detectedDept = 'B.Sc. in Pharmacy (PHR)';
  else if (/ARCHITECTURE/i.test(text))                 detectedDept = 'B.Sc. in Architecture (ARC)';
  else if (/LAW/i.test(text))                          detectedDept = 'Bachelor of Laws (LLB)';
  else if (/B\.?A\.?\s+IN\s+ENGLISH|BACHELOR\s+OF\s+ARTS\s+IN\s+ENGLISH/i.test(text)) detectedDept = 'B.A. in English (ENG)';

  return { semesters, detectedDept };
}

// ── parseTranscriptText ───────────────────────────────────────────────────────
// BRACU PDFs (via pdf.js) render in column order:
//   • All semester blocks (codes + titles) appear first, each followed by
//     semester/cumulative credit totals (which we skip)
//   • Then ALL individual course credits in one contiguous block
//   • Then ALL grades in one contiguous block
//   • Then ALL grade points in one contiguous block
export function parseTranscriptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Dept detection ────────────────────────────────────────────────────────
  let detectedDept = null;
  if (/COMPUTER[\s\S]{0,10}SCIENCE|B\.?SC\.?\s+IN\s+COMPUTER/i.test(text))
    detectedDept = 'BSc CSE — Computer Science & Engineering';
  else if (/ELECTRICAL/i.test(text))
    detectedDept = 'BSc EEE — Electrical & Electronic Engineering';
  else if (/BUSINESS ADMINISTRATION/i.test(text))
    detectedDept = 'BBA — Business Administration';
  else if (/PHARMACY/i.test(text))
    detectedDept = 'B.Sc. in Pharmacy (PHR)';
  else if (/ARCHITECTURE/i.test(text))
    detectedDept = 'B.Sc. in Architecture (ARC)';
  else if (/LAW/i.test(text))
    detectedDept = 'Bachelor of Laws (LLB)';
  else if (/B\.?A\.?\s+IN\s+ENGLISH|BACHELOR\s+OF\s+ARTS\s+IN\s+ENGLISH/i.test(text))
    detectedDept = 'B.A. in English (ENG)';

  const SEASON_NAMES = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const semRe    = /^SEMESTER:\s*([A-Z]+)\s+(\d{4})/i;
  const codeRe   = /^([A-Z]{2,4}\d{3}[A-Z]?)$/;
  const numberRe = /^\d+\.\d+$/;
  const gradeRe  = /^([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)$/;
  // Lines to skip entirely in pass 1
  const skipRe   = /^(SEMESTER\b(?!:)|CUMULATIVE\s+Credits|Credits\s+(Attempted|Earned)|GPA$|CGPA$|BRAC\s+University|Kha\s+224|Merul|GRADE\s+SHEET|UNOFFICIAL|Student\s+ID|^Name$|Course\s+No|Course\s+Title|UNDERGRADUATE|PROGRAM:|Page\s+\d|Credits\s+Earned\s+Grade|Grade\s+Points)/i;

  // ── Pass 1: collect semester codes + titles (ignore all numbers) ──────────
  const sems = [];
  let curSem = null;

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
      continue;
    }
    if (!curSem) continue;

    const cm = line.match(codeRe);
    if (cm) {
      curSem.codes.push(cm[1]);
      continue;
    }

    // Title line — pair with latest unmatched code, or extend previous title
    if (!line[0].match(/\d/)) {
      if (curSem.titles.length < curSem.codes.length) {
        curSem.titles.push(line);
      } else if (curSem.titles.length > 0) {
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
    if (/^Credits Earned$/i.test(lines[i])) {
      // Confirm next non-empty line is a decimal
      if (i + 1 < lines.length && numberRe.test(lines[i + 1])) {
        creditsBlockStart = i + 1;
        break;
      }
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
  const semRe      = /^SEMESTER[:\s]*([A-Z]+)\s+(\d{4})/i;
  const skipRe     = /^(SEMESTER|CUMULATIVE)\s+Credits|^(Credits Attempted|Credits Earned|GPA|CGPA)|^(BRAC University|Grade Sheet|Student|Name|Program|Course No)|^Page \d/i;
  const fntRe      = /F\s*\(NT\)/;
  const courseRe   = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const codeOnlyRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const partialRe  = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)$/;
  const contRe     = /^([A-Za-z][A-Za-z\s&:,\(\)\-\.]*?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s+([\d]+\.[\d]+)$/;

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
    if (fntRe.test(line)) {
      const code = line.trim().split(/\s+/)[0];
      if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) {
        const credM = line.match(/\b(\d+\.\d+)\b/);
        currentSem.courses.push({ name: code, credits: credM ? parseFloat(credM[1]) : 0, grade: 'F(NT)', gradePoint: 'NT' });
        pendingTitle = null; continue;
      }
    }
    if (pendingTitle) {
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
      const grade = co[3].replace(/\(RT\)/,'').trim();
      const title = pendingTitle ? pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/,'').trim() : '';
      currentSem.courses.push({ name: title ? `${title} (${co[1]})` : co[1], credits: parseFloat(co[2]), grade, gradePoint: parseFloat(co[4]) });
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