import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState, clearState } from '../core/state.js';
import { getRetakenKeys, calcSemGPA } from '../core/calculator.js';
import { parseTranscriptText, parseBlobFallback } from '../import/parser.js';
import { COURSE_DB } from '../core/catalog.js';

function getModalTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (isDark) {
    return {
      isDark,
      text:              '#e8f0ea',
      text2:             '#a8c4ad',
      text3:             '#6a9070',
      card:              '#0f1f14',
      tableBorder:       'rgba(46,204,113,0.18)',
      tableRowBorder:    'rgba(46,204,113,0.10)',
      tableHeadBg:       'rgba(46,204,113,0.07)',
      inputBg:           'rgba(46,204,113,0.07)',
      warnBg:            'rgba(231,76,60,0.12)',
      warnBorder:        'rgba(231,76,60,0.3)',
      warnText:          '#e74c3c',
      highlightBg:       'rgba(46,204,113,0.08)',
      highlightBorder:   'rgba(46,204,113,0.22)',
      cancelBg:          'rgba(255,255,255,0.07)',
      cancelBorder:      'rgba(255,255,255,0.18)',
      cancelText:        'rgba(255,255,255,0.78)',
      cancelHover:       'rgba(255,255,255,0.13)',
    };
  } else {
    return {
      isDark,
      text:              '#0d2914',
      text2:             '#2d5a3d',
      text3:             '#5a8a6a',
      card:              '#ffffff',
      tableBorder:       'rgba(0,0,0,0.12)',
      tableRowBorder:    'rgba(0,0,0,0.07)',
      tableHeadBg:       'rgba(46,204,113,0.06)',
      inputBg:           'rgba(46,204,113,0.05)',
      warnBg:            'rgba(231,76,60,0.06)',
      warnBorder:        'rgba(231,76,60,0.2)',
      warnText:          '#c0392b',
      highlightBg:       'rgba(46,204,113,0.06)',
      highlightBorder:   'rgba(46,204,113,0.18)',
      cancelBg:          'rgba(0,0,0,0.05)',
      cancelBorder:      'rgba(0,0,0,0.18)',
      cancelText:        '#2d5a3d',
      cancelHover:       'rgba(0,0,0,0.09)',
    };
  }
}

export function showImportModal(html) {
  const modal    = document.getElementById('importModal');
  const card     = document.getElementById('importModalCard');
  const content  = document.getElementById('importModalContent');
  if (!modal || !content) return;
  const t = getModalTheme();
  card.style.background   = t.card;
  card.style.borderColor  = t.tableBorder;
  content.innerHTML = html;
  modal.style.display = 'flex';
  requestAnimationFrame(() => { modal.style.opacity = '1'; });
  modal.addEventListener('click', function _bd(e) {
    if (e.target === modal) { hideImportModal(); modal.removeEventListener('click', _bd); }
  });
}

export function hideImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) { modal.style.opacity = '0'; setTimeout(() => { modal.style.display = 'none'; }, 220); }
}

export async function importTranscriptPDF(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const btn = document.getElementById('importPdfBtn');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '⏳ Reading…'; btn.disabled = true; }

  try {
    if (!window.pdfjsLib) { throw new Error('PDF.js not loaded. Check your connection.'); }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let   fullText    = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      let lastY = null;
      content.items.forEach(item => {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) fullText += '\n';
        fullText += item.str;
        lastY = item.transform[5];
      });
      fullText += '\n';
    }

    let parsed = parseTranscriptText(fullText);

    const totalCourses = parsed.semesters.reduce((s,sem)=>s+sem.courses.length,0);
    const semCount     = parsed.semesters.length;
    if (semCount > 0 && totalCourses < semCount * 2) {
      console.warn('[Shohoj] Line parser got only', totalCourses, 'courses — trying blob fallback');
      const blobParsed = parseBlobFallback(fullText);
      if (blobParsed.semesters.length > 0) {
        const blobTotal = blobParsed.semesters.reduce((s,sem)=>s+sem.courses.length,0);
        if (blobTotal > totalCourses) {
          console.info('[Shohoj] Blob fallback found', blobTotal, 'courses — using it');
          parsed = blobParsed;
        }
      }
    }

    // ── Post-parse cleanup: names, credits ─────────────────────────────
    // PDF gives ALL-CAPS names like "CSE110 PROGRAMMING LANGUAGE I".
    // Replace with clean catalog names like "Programming Language I (CSE110)".
    // Also fix F(NT) credits — BRACU PDFs show 0.00 but they count in GPA.
    parsed.semesters.forEach(sem => {
      sem.courses.forEach(c => {
        // Extract course code from parsed name
        const codeMatch = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/)
                       || c.name.match(/^([A-Z]{2,4}\d{3}[A-Z]?)\b/);
        const code = codeMatch ? codeMatch[1] : null;
        if (!code) return;

        const cat = COURSE_DB[code];
        if (cat) {
          // Use clean catalog name: "Programming Language I (CSE110)"
          c.name = cat.full;
          // Use catalog credits when PDF shows 0 (F(NT) case)
          if (!c.credits && cat.credits) c.credits = cat.credits;
        } else if (c.grade === 'F(NT)' && !c.credits) {
          // Not in catalog but 100+ level → default 3 credits
          const num = parseInt(code.replace(/^[A-Z]+/, ''));
          if (num >= 100) c.credits = 3;
        }
      });
    });

    if (!parsed.semesters.length) {
      showImportModal(`
        <div style="text-align:center;padding:20px">
          <div style="font-size:32px;margin-bottom:12px">⚠️</div>
          <div style="font-size:16px;font-weight:700;color:${getModalTheme().text};margin-bottom:8px">Could not parse transcript</div>
          <div style="font-size:13px;color:${getModalTheme().text2};margin-bottom:16px">
            No semesters were detected. Make sure this is a BRACU official grade sheet PDF.
          </div>
          <button onclick="hideImportModal()" style="background:var(--green);color:#0b0f0d;border:none;border-radius:8px;padding:8px 20px;font-weight:700;cursor:pointer;">Close</button>
        </div>`);
      return;
    }

    const t2 = getModalTheme();
    const semRows = parsed.semesters.map(s => `
      <tr style="border-bottom:1px solid ${t2.tableRowBorder}">
        <td style="padding:4px 8px;font-size:12px;color:${t2.text}">${s.name}</td>
        <td style="padding:4px 8px;text-align:center;font-size:12px;color:${t2.text2}">${s.courses.length} courses</td>
        <td style="padding:4px 8px;text-align:center;font-size:13px;color:#1DB954;font-weight:600">${s.courses.filter(c=>c.grade&&c.grade!=='P'&&c.grade!=='I'&&c.credits>0).length} graded</td>
      </tr>`
    ).join('');

    const totalCoursesDisplay = parsed.semesters.reduce((n, s) => n + s.courses.length, 0);

    showImportModal(`
      <div style="margin-bottom:16px">
        <div style="font-size:18px;font-weight:700;color:${t2.text};margin-bottom:4px">📄 Transcript Parsed</div>
        <div style="font-size:12px;color:${t2.text3}">Found <strong style="color:#1DB954">${parsed.semesters.length} semesters</strong> and <strong style="color:#1DB954">${totalCoursesDisplay} courses</strong></div>
      </div>
      <div style="overflow-x:auto;margin-bottom:16px;border:1px solid ${t2.tableBorder};border-radius:8px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid ${t2.tableRowBorder};background:${t2.tableHeadBg}">
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Semester</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Courses</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Graded</th>
          </tr></thead>
          <tbody>${semRows}</tbody>
        </table>
      </div>
      ${parsed.detectedDept ? `<div style="margin-bottom:12px;font-size:12px;color:${t2.text2}">🎓 Department detected: <strong style="color:#1DB954">${parsed.detectedDept}</strong></div>` : ''}
      <div style="display:flex;gap:10px">
        <button onclick="applyImport(${JSON.stringify(parsed).replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')})"
          onmouseenter="this.style.background='#17a348';this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(46,204,113,0.35)'"
          onmouseleave="this.style.background='#1DB954';this.style.transform='';this.style.boxShadow=''"
          style="flex:1;background:#1DB954;color:#0b0f0d;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s">
          ✅ Import Now
        </button>
        <button onclick="hideImportModal()"
          onmouseenter="this.style.background='${t2.cancelHover}'"
          onmouseleave="this.style.background='${t2.cancelBg}'"
          style="background:${t2.cancelBg};color:${t2.cancelText};border:1px solid ${t2.cancelBorder};border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s">
          Cancel
        </button>
      </div>`);

  } catch (err) {
    showImportModal(`
      <div style="text-align:center;padding:20px">
        <div style="font-size:32px;margin-bottom:12px">❌</div>
        <div style="font-size:15px;font-weight:700;color:${getModalTheme().text};margin-bottom:8px">Import failed</div>
        <div style="font-size:12px;color:${getModalTheme().text2};margin-bottom:16px">${err.message}</div>
        <button onclick="hideImportModal()" style="background:var(--green);color:#0b0f0d;border:none;border-radius:8px;padding:8px 20px;font-weight:700;cursor:pointer;">Close</button>
      </div>`);
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false; }
    if (inputEl) inputEl.value = '';
  }
}

export function applyImport(parsed) {
  hideImportModal();
  clearState();

  state.currentDept = null;
  const _dSel = document.getElementById('deptSelect'); if (_dSel) _dSel.value = '';
  document.getElementById('deptCreditsText').textContent = '';
  const _dCred = document.getElementById('deptCredits'); if (_dCred) _dCred.style.display = 'none';

  if (parsed.detectedDept) {
    const deptKey = Object.keys(DEPARTMENTS).find(k => DEPARTMENTS[k].label === parsed.detectedDept);
    if (deptKey) {
      state.currentDept = deptKey;
      const sel = document.getElementById('deptSelect');
      if (sel) sel.value = deptKey;
      const dept = DEPARTMENTS[deptKey];
      document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
      const credEl = document.getElementById('deptCredits');
      if (credEl) credEl.style.display = 'inline-flex';
      const startRow = document.getElementById('startSemRow');
      if (startRow) startRow.style.display = 'flex';
    }
  }

  state.semesters = parsed.semesters.map((s, idx) => ({
    ...s,
    id: idx + 1,
    courses: s.courses.map(c => ({
      name:       c.name       || '',
      credits:    c.credits    || 0,
      grade:      c.grade      || '',
      gradePoint: c.gradePoint !== undefined ? c.gradePoint : '',
    })),
  }));
  state.semesterCounter = state.semesters.length + 1;

  if (state.semesters.length > 0) {
    const first   = state.semesters[0];
    const parts   = first.name.split(' ');
    const season  = parts[0];
    const year    = parts[1];
    const seasonEl = document.getElementById('startSeason');
    const yearEl   = document.getElementById('startYear');
    if (seasonEl && ['Spring','Summer','Fall'].includes(season)) seasonEl.value = season;
    if (yearEl   && year && /^\d{4}$/.test(year))                yearEl.value   = year;
  }

  window._shohoj_renderAndRecalc();
  saveState();

  const calc = document.getElementById('calculator');
  if (calc) {
    const top = calc.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

export function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('PDF library not loaded. Please check your connection.'); return; }
  if (!state.semesters.length) { alert('No data to export.'); return; }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297;
  const ML = 14, MR = 14;
  const CW = PW - ML - MR;
  let y = ML;

  const GREEN      = [46, 204, 113];
  const GREEN_DARK = [27, 122, 67];
  const GREEN_BG   = [232, 248, 240];
  const BLUE_BG    = [232, 243, 255];
  const BLUE_TXT   = [24, 95, 165];
  const AMBER_BG   = [254, 249, 236];
  const AMBER_TXT  = [180, 117, 23];
  const RED_BG     = [253, 240, 238];
  const RED_TXT    = [192, 57, 43];
  const ORANGE_BG  = [255, 242, 238];
  const ORANGE_TXT = [180, 80, 30];
  const LGREY      = [247, 251, 248];
  const BORDER     = [220, 235, 225];
  const TEXT1      = [13, 31, 16];
  const TEXT2      = [107, 144, 112];
  const TEXT3      = [160, 184, 165];
  const WHITE      = [255, 255, 255];

  const setFill   = c => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const setTxt    = c => doc.setTextColor(c[0], c[1], c[2]);
  const fmtCr = n => n % 1 === 0 ? String(n) : n.toFixed(1);

  const gpaColor = gpa => gpa >= 3.0 ? GREEN_DARK : gpa >= 2.5 ? AMBER_TXT : RED_TXT;
  const gpaBg = gpa => gpa >= 3.0 ? GREEN_BG : gpa >= 2.5 ? AMBER_BG : RED_BG;

  const gradeColors = g => {
    if (!g) return { bg: LGREY, txt: TEXT2, border: BORDER };
    if (g.startsWith('A'))          return { bg: GREEN_BG,  txt: GREEN_DARK, border: [192, 232, 208] };
    if (g.startsWith('B'))          return { bg: BLUE_BG,   txt: BLUE_TXT,   border: [192, 216, 240] };
    if (g.startsWith('C'))          return { bg: AMBER_BG,  txt: AMBER_TXT,  border: [240, 221, 160] };
    if (g.startsWith('D'))          return { bg: ORANGE_BG, txt: ORANGE_TXT, border: [240, 200, 184] };
    if (g === 'F' || g === 'F(NT)') return { bg: RED_BG,    txt: RED_TXT,    border: [240, 184, 176] };
    if (g === 'P')                  return { bg: GREEN_BG,  txt: GREEN_DARK, border: [192, 232, 208] };
    return { bg: LGREY, txt: TEXT2, border: BORDER };
  };

  const checkY = (needed = 20) => {
    if (y + needed > PH - 14) {
      doc.addPage(); y = 14;
      setFill(GREEN); doc.rect(0, 0, PW, 1.5, 'F');
      doc.setFontSize(6.5); setTxt(TEXT3); doc.setFont('helvetica', 'normal');
      doc.text('Shohoj CGPA Report (continued)', ML, 8);
      doc.text('souravmondalshuvo.github.io/Shohoj', PW - MR, 8, { align: 'right' });
      y = 14;
    }
  };

  let totalPts = 0, totalCr = 0, totalEarned = 0, totalAttempted = 0;
  const rk = getRetakenKeys();
  state.semesters.forEach(sem => {
    if (sem.running) return;
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
      totalAttempted += c.credits;
      if (!rk.has(sem.id + '-' + i)) {
        if (gp !== null) { totalPts += gp * c.credits; totalCr += c.credits; }
        if (gp > 0) totalEarned += c.credits;
      }
    });
  });
  const cgpa = totalCr > 0 ? totalPts / totalCr : null;
  const semCount = state.semesters.filter(s => !s.running).length;
  const standing = cgpa === null ? '---'
    : cgpa >= 3.97 ? 'Perfect' : cgpa >= 3.65 ? 'Higher Distinction'
    : cgpa >= 3.50 ? 'Distinction' : cgpa >= 3.00 ? 'Good Standing'
    : cgpa >= 2.50 ? 'Satisfactory' : cgpa >= 2.00 ? 'Needs Improvement'
    : 'Probation';

  setFill(GREEN); doc.rect(0, 0, PW, 1.5, 'F');

  // Logo as base64 PNG (স in green rounded square)
  const LOGO_B64 = 'data:image/png;base64,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';
  try { doc.addImage(LOGO_B64, 'PNG', ML, y + 4, 18, 18); } catch(e) {
    // Fallback if image fails
    setFill(GREEN); doc.roundedRect(ML, y + 4, 18, 18, 2.5, 2.5, 'F');
  }

  doc.setFontSize(15); setTxt(TEXT1); doc.setFont('helvetica', 'bold');
  doc.text('CGPA Report', ML + 22, y + 10);
  const deptLabel = state.currentDept && DEPARTMENTS[state.currentDept]
    ? DEPARTMENTS[state.currentDept].label : 'BRAC University';
  doc.setFontSize(7.5); setTxt(TEXT2); doc.setFont('helvetica', 'normal');
  doc.text(deptLabel + '   .   BRAC University', ML + 22, y + 16);
  doc.setFontSize(6.5); setTxt(TEXT3);
  doc.text('Generated by Shohoj . souravmondalshuvo.github.io/Shohoj', ML + 22, y + 21);

  if (cgpa !== null) {
    const cgpaCol = cgpa >= 3.5 ? GREEN : cgpa >= 3.0 ? GREEN_DARK : cgpa >= 2.5 ? AMBER_TXT : RED_TXT;
    doc.setFontSize(30); doc.setFont('helvetica', 'bold');
    doc.setTextColor(cgpaCol[0], cgpaCol[1], cgpaCol[2]);
    doc.text(cgpa.toFixed(2), PW - MR, y + 14, { align: 'right' });
    doc.setFontSize(6.5); setTxt(TEXT3); doc.setFont('helvetica', 'normal');
    doc.text('CUMULATIVE GPA', PW - MR, y + 20, { align: 'right' });
  }
  y += 30;

  setStroke(GREEN); doc.setLineWidth(0.8); doc.line(ML, y, PW - MR, y); y += 6;

  const stats = [
    [fmtCr(totalAttempted), 'Credits Attempted'],
    [fmtCr(totalEarned),    'Credits Earned'],
    [semCount.toString(),    'Semesters'],
    [standing,               'Academic Standing'],
  ];
  const statW = CW / stats.length;
  setFill(LGREY); setStroke(BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 16, 2, 2, 'FD');
  stats.forEach((_, i) => { if (i === 0) return; doc.line(ML + i * statW, y + 2, ML + i * statW, y + 14); });
  stats.forEach(([val, label], i) => {
    const sx = ML + i * statW + statW / 2;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    const valCol = label === 'Academic Standing' ? (cgpa >= 3.0 ? GREEN_DARK : cgpa >= 2.5 ? AMBER_TXT : RED_TXT) : TEXT1;
    doc.setTextColor(valCol[0], valCol[1], valCol[2]);
    doc.text(val, sx, y + 7.5, { align: 'center' });
    doc.setFontSize(6); setTxt(TEXT3); doc.setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), sx, y + 12.5, { align: 'center' });
  });
  y += 22;

  const COL = { name: ML, cr: ML + 118, gp: ML + 132, grade: ML + 136, note: ML + 164 };
  const BADGE_W = 26;

  state.semesters.forEach(sem => {
    const semGpa = calcSemGPA(sem);
    checkY(24);

    const gCol = semGpa !== null ? gpaColor(semGpa) : TEXT2;
    const gBg  = semGpa !== null ? gpaBg(semGpa)    : LGREY;
    setFill(gBg); setStroke(BORDER); doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 8, 1.5, 1.5, 'FD');
    setFill(GREEN); doc.roundedRect(ML, y, 3, 8, 1, 1, 'F');
    doc.rect(ML + 1.5, y, 1.5, 8, 'F');

    const semNameClean = sem.name.replace(/<[^>]+>/g, '').replace(/\s*\((\d+(?:st|nd|rd|th)) Semester\)/i, ' | $1 Semester') + (sem.running ? ' [Running]' : '');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(TEXT1);
    doc.text(semNameClean, ML + 6, y + 5.3);

    if (semGpa !== null) {
      const gpaLabel = 'GPA  ' + semGpa.toFixed(2);
      const pillW = 22, pillH = 5, pillX = PW - MR - pillW;
      setFill(gBg); doc.setDrawColor(gCol[0], gCol[1], gCol[2]);
      doc.roundedRect(pillX, y + 1.5, pillW, pillH, 1.5, 1.5, 'FD');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.setTextColor(gCol[0], gCol[1], gCol[2]);
      doc.text(gpaLabel, pillX + pillW / 2, y + 5, { align: 'center' });
    }
    y += 10;

    setFill([238, 245, 240]); doc.rect(ML, y, CW, 5, 'F');
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); setTxt(TEXT3);
    doc.text('COURSE', COL.name, y + 3.5);
    doc.text('CR', COL.cr, y + 3.5, { align: 'right' });
    doc.text('GP', COL.gp, y + 3.5, { align: 'right' });
    doc.text('GRADE', COL.grade + BADGE_W / 2, y + 3.5, { align: 'center' });
    doc.text('NOTE', COL.note, y + 3.5);
    y += 6;

    sem.courses.forEach((c, ci) => {
      if (!c.name.trim() && !c.grade) return;
      checkY(8);
      const isRet = rk.has(sem.id + '-' + ci);
      if (ci % 2 === 0) { setFill(LGREY); doc.rect(ML, y - 0.5, CW, 7, 'F'); }
      setStroke([232, 240, 234]); doc.setLineWidth(0.2);
      doc.line(ML, y + 6.5, PW - MR, y + 6.5);

      const nameMax = 68;
      const rawName = c.name || '---';
      const nameStr = rawName.length > nameMax ? rawName.slice(0, nameMax - 3) + '...' : rawName;
      doc.setFontSize(7); doc.setFont('helvetica', isRet ? 'italic' : 'normal');
      setTxt(isRet ? TEXT3 : TEXT1);
      doc.text(nameStr, COL.name, y + 4.5);

      setTxt(TEXT2); doc.setFont('helvetica', 'normal');
      doc.text(c.credits !== undefined && c.credits !== null ? c.credits.toString() : '--', COL.cr, y + 4.5, { align: 'right' });

      const gp = GRADES[c.grade];
      const gpDisplay = c.grade === 'F(NT)' ? '0.00' : (gp !== undefined && gp !== null ? gp.toFixed(2) : '--');
      doc.text(gpDisplay, COL.gp, y + 4.5, { align: 'right' });

      if (c.grade) {
        const { bg, txt, border } = gradeColors(c.grade);
        const badgeX = COL.grade;
        setFill(bg); doc.setDrawColor(border[0], border[1], border[2]);
        doc.setLineWidth(0.3);
        doc.roundedRect(badgeX, y + 0.5, BADGE_W, 5.5, 1.5, 1.5, 'FD');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.setTextColor(txt[0], txt[1], txt[2]);
        doc.text(c.grade, badgeX + BADGE_W / 2, y + 4.3, { align: 'center' });
      }

      const note = isRet ? 'Retaken' : c.grade === 'F(NT)' ? 'No Transfer' : c.grade === 'P' ? 'Pass/Fail' : '';
      if (note) { doc.setFontSize(6); setTxt(TEXT3); doc.setFont('helvetica', 'normal'); doc.text(note, COL.note, y + 4.5); }
      y += 7;
    });

    // Semester summary row
    if (semGpa !== null) {
      checkY(8);
      const semAttempted = sem.courses.reduce((s, c) => {
        if (!c.name.trim() || !c.credits) return s;
        if (c.grade === 'P' || c.grade === 'I') return s;
        return s + c.credits;
      }, 0);
      const semFailed = sem.courses.reduce((s, c) => {
        if (!c.name.trim() || !c.credits) return s;
        const gp = GRADES[c.grade];
        if (gp === undefined || gp === null) return s;
        if (gp === 0) return s + c.credits; // F and F(NT) = 0 GP, not earned
        return s;
      }, 0);
      const semEarned = semAttempted - semFailed;

      setFill([238, 248, 241]); doc.rect(ML, y, CW, 6, 'F');
      setStroke(BORDER); doc.setLineWidth(0.15);
      doc.line(ML, y, PW - MR, y);
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); setTxt(TEXT3);
      const summaryText = `Credits Attempted: ${fmtCr(semAttempted)}   ·   Credits Earned: ${fmtCr(semEarned)}   ·   Semester GPA: ${semGpa.toFixed(2)}`;
      doc.text(summaryText, ML + CW / 2, y + 4, { align: 'center' });
      y += 6;
    }

    y += 5;
  });

  const footerY = PH - 10;
  setStroke(BORDER); doc.setLineWidth(0.4); doc.line(ML, footerY, PW - MR, footerY);
  setFill(LGREY); doc.rect(0, footerY, PW, 10, 'F');
  try { doc.addImage(LOGO_B64, 'PNG', ML, footerY + 1.5, 7, 7); } catch(e) {
    setFill(GREEN); doc.roundedRect(ML, footerY + 2.5, 7, 7, 1.5, 1.5, 'F');
  }
  doc.setFontSize(6.5); setTxt(TEXT3); doc.setFont('helvetica', 'normal');
  doc.text('Generated by Shohoj . BRAC University CGPA Calculator', ML + 10, footerY + 6.5);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  doc.text(dateStr, PW - MR, footerY + 6.5, { align: 'right' });

  doc.save('BRACU_CGPA_Report_Shohoj.pdf');
}