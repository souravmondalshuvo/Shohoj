// ── _parseContLine ────────────────────────────────────────────────────────────
function _parseContLine(line, pendingTitle) {
  const floatRe = /\b(\d+\.\d+)\b/g;
  const floats  = [...line.matchAll(floatRe)].map(m => ({ val: parseFloat(m[1]), idx: m.index }));
  const gradeRe = /(?<!\w)((?:[A-Z][+-]?)(?:\((?:NT|RT)\))|[A-Z][+-]?)(?!\w)/;
  const gradeM  = line.match(gradeRe);
  const grade   = gradeM ? gradeM[1].replace(/\(RT\)/,'').trim() : null;
  if (floats.length < 1 || !grade) return null;
  const credits    = floats[0].val;
  const gradePoint = floats[floats.length - 1].val;
  const beforeFirst = line.slice(0, floats[0].idx).trim().replace(/\s{2,}/g, ' ');
  const fullTitle   = (pendingTitle ? pendingTitle + ' ' : '') + beforeFirst;
  return { fullTitle: fullTitle.trim(), credits, grade: grade.trim(), gradePoint };
}

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
export function parseTranscriptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

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
  const semRe   = /^SEMESTER[:\s]*([A-Z]+)\s+(\d{4})/i;
  const skipRe  = /^(SEMESTER|CUMULATIVE)\s+Credits|^(Credits Attempted|Credits Earned|GPA|CGPA)|^(BRAC University|Grade Sheet|Student|Name|Program|Course No)|^Page \d/i;
  const fntRe   = /F\s*\(NT\)/;
  const courseRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const codeOnlyRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const titleFragRe = /^[A-Z][A-Z\s&:,\(\)\-\.]+$/;

  const semesters  = [];
  let currentSem   = null;
  let pendingTitle = null;
  let skipNextFrag = false;

  for (const line of lines) {
    if (skipRe.test(line)) { pendingTitle = null; skipNextFrag = false; continue; }

    const semM = line.match(semRe);
    if (semM) {
      const season = semM[1].toUpperCase();
      currentSem = {
        id: Date.now() + semesters.length,
        name: `${SEASON_NAMES[season] || semM[1]} ${semM[2]}`,
        courses: [],
        running: false,
      };
      semesters.push(currentSem);
      pendingTitle = null; skipNextFrag = false;
      continue;
    }

    if (!currentSem) continue;

    if (skipNextFrag) {
      skipNextFrag = false;
      if (titleFragRe.test(line)) continue;
    }

    if (fntRe.test(line)) {
      const code = line.trim().split(/\s+/)[0];
      if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) {
        currentSem.courses.push({ name: code, credits: 0, grade: 'F(NT)', gradePoint: 'NT' });
        pendingTitle = null; continue;
      }
    }

    const co = line.match(codeOnlyRe);
    if (co) {
      const grade = co[3].replace(/\(RT\)/,'').trim();
      const title = pendingTitle ? pendingTitle.trim() : '';
      const name  = title ? `${title} (${co[1]})` : co[1];
      currentSem.courses.push({ name, credits: parseFloat(co[2]), grade, gradePoint: parseFloat(co[4]) });
      pendingTitle = null; skipNextFrag = true; continue;
    }

    const cm = line.match(courseRe);
    if (cm) {
      let grade = cm[4].trim().replace(/\s+/g,'');
      if (/F.*NT/i.test(cm[4])) grade = 'F(NT)';
      else grade = grade.replace('(RT)','').replace('(NT)','').trim();
      const name = cm[1] + ' ' + cm[2].trim();
      currentSem.courses.push({ name, credits: parseFloat(cm[3]), grade, gradePoint: parseFloat(cm[5]) });
      pendingTitle = null; continue;
    }

    if (!line[0].match(/\d/) && line.length > 2 && line.length < 100
        && !/^[A-Z]{2,4}\d{3}/.test(line)) {
      pendingTitle = (pendingTitle ? pendingTitle + ' ' : '') + line;
    } else {
      pendingTitle = null;
    }
  }

  return { semesters: semesters.filter(s => s.courses.length > 0), detectedDept };
}
