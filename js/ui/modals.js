import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState, clearState } from '../core/state.js';
import { getRetakenKeys, calcSemGPA } from '../core/calculator.js';
import { parseTranscriptText, parseBlobFallback } from '../import/parser.js';

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
        <td style="padding:4px 8px;text-align:center;font-size:13px;color:#1DB954;font-weight:600">${s.courses.filter(c=>c.grade&&c.grade!=='P'&&c.grade!=='I'&&c.grade!=='F(NT)'&&c.credits>0).length} graded</td>
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

  const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW   = 210, PH = 297;
  const ML   = 14, MR = 14, MT = 14;
  const CW   = PW - ML - MR;
  let   y    = MT;

  const GREEN  = [46, 204, 113];
  const DARK   = [11, 15, 13];
  const GREY3  = [120, 140, 125];
  const WHITE  = [240, 245, 242];
  const GOLD   = [240, 165,   0];
  const RED    = [231,  76,  60];

  const gradeColor = g => {
    if (!g) return GREY3;
    if (g === 'F' || g === 'F(NT)') return RED;
    if (g.startsWith('A')) return GREEN;
    if (g.startsWith('B')) return [39, 174, 96];
    if (g.startsWith('C')) return GOLD;
    if (g.startsWith('D')) return [230, 126, 34];
    return GREY3;
  };

  const checkY = () => {
    if (y + 20 > PH - 12) {
      doc.addPage();
      doc.setFillColor(DARK[0], DARK[1], DARK[2]);
      doc.rect(0, 0, PW, 10, 'F');
      doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.rect(0, 10, PW, 1, 'F');
      doc.setFontSize(7);
      doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
      doc.text('Shohoj — BRACU CGPA Report', ML, 7);
      doc.text('souravmondalshuvo.github.io/Shohoj', PW - MR, 7, { align: 'right' });
      y = 18;
    }
  };

  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(0, 0, PW, 38, 'F');
  doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
  doc.rect(0, 38, PW, 1.2, 'F');
  doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
  doc.roundedRect(ML, 7, 16, 16, 2, 2, 'F');
  doc.setFontSize(14);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('S', ML + 8, 18.5, { align: 'center' });
  doc.setFontSize(18);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('CGPA Report', ML + 20, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
  const deptLabel = state.currentDept && DEPARTMENTS[state.currentDept] ? DEPARTMENTS[state.currentDept].label : 'BRAC University';
  doc.text(deptLabel, ML + 20, 20);
  doc.text('Generated by Shohoj · souravmondalshuvo.github.io/Shohoj', ML + 20, 26);

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
      }
      if (gp > 0 && !rk.has(sem.id + '-' + i)) totalEarned += c.credits;
    });
  });
  const cgpa = totalCr > 0 ? totalPts / totalCr : null;
  if (cgpa !== null) {
    const cgpaColor = cgpa >= 3.5 ? GREEN : cgpa >= 3.0 ? [39,174,96] : cgpa >= 2.5 ? GOLD : RED;
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...cgpaColor);
    doc.text(cgpa.toFixed(2), PW - MR, 20, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
    doc.text('CGPA', PW - MR, 27, { align: 'right' });
  }
  y = 50;

  const stats = [
    ['Credits Attempted', totalAttempted.toFixed(1)],
    ['Credits Earned',    totalEarned.toFixed(1)],
    ['Semesters',         state.semesters.filter(s => !s.running).length.toString()],
    ['Standing', cgpa === null ? '—' : cgpa >= 3.5 ? 'Excellent' : cgpa >= 3.0 ? 'Good' : cgpa >= 2.5 ? 'Satisfactory' : 'Warning'],
  ];
  const statW = CW / stats.length;
  doc.setFillColor(22, 38, 28);
  doc.roundedRect(ML, y, CW, 16, 2, 2, 'F');
  stats.forEach(([label, val], idx) => {
    const sx = ML + idx * statW + statW / 2;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.text(val, sx, y + 7, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
    doc.text(label.toUpperCase(), sx, y + 12.5, { align: 'center' });
  });
  y += 22;

  state.semesters.forEach(sem => {
    const semGpa = calcSemGPA(sem);
    checkY();
    doc.setFillColor(18, 32, 22);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(ML, y, 2.5, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    const semNameClean = sem.name.replace(/<[^>]+>/g, '');
    doc.text(semNameClean + (sem.running ? '  [Running]' : ''), ML + 5, y + 5);
    if (semGpa !== null) {
      const gc = semGpa >= 3.5 ? GREEN : semGpa >= 3.0 ? [39,174,96] : semGpa >= 2.5 ? GOLD : RED;
      doc.setTextColor(...gc);
      doc.text('GPA ' + semGpa.toFixed(2), PW - MR, y + 5, { align: 'right' });
    }
    y += 9;

    // COL.grade wider (22→fits "C+" etc), COL.note adjusted accordingly
    const COL = { name: ML, cr: ML+88, gp: ML+102, grade: ML+116, note: ML+140 };
    doc.setFillColor(14, 26, 18);
    doc.rect(ML, y, CW, 5.5, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
    doc.text('COURSE', COL.name, y + 3.8);
    doc.text('CR', COL.cr, y + 3.8, { align: 'right' });
    doc.text('GP', COL.gp, y + 3.8, { align: 'right' });
    doc.text('GRADE', COL.grade + 11, y + 3.8, { align: 'center' });
    doc.text('NOTE', COL.note, y + 3.8);
    y += 7;

    sem.courses.forEach((c, ci) => {
      if (!c.name.trim() && !c.grade) return;
      checkY();
      const isRet = rk.has(sem.id + '-' + ci);
      if (ci % 2 === 0) {
        doc.setFillColor(12, 22, 16);
        doc.rect(ML, y - 1, CW, 6, 'F');
      }
      doc.setFontSize(7.5);
      doc.setFont('helvetica', isRet ? 'italic' : 'normal');
      const _tc = isRet ? GREY3 : WHITE; doc.setTextColor(_tc[0], _tc[1], _tc[2]);
      // FIX 1: increase max name length now that grade col shifted left
      const nameStr = c.name.length > 50 ? c.name.slice(0, 48) + '…' : c.name;
      doc.text(nameStr || '—', COL.name, y + 3.2);
      doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
      // FIX 2: show '0' for zero-credit courses instead of '—'
      doc.text(c.credits !== undefined && c.credits !== null ? c.credits.toString() : '—', COL.cr, y + 3.2, { align: 'right' });
      const gp = GRADES[c.grade];
      // FIX 3: show '0.00' for F(NT) (gp=null means no GPA impact, but GP was 0)
      const gpDisplay = c.grade === 'F(NT)' ? '0.00'
        : (gp !== undefined && gp !== null ? gp.toFixed(2) : '—');
      doc.text(gpDisplay, COL.gp, y + 3.2, { align: 'right' });
      if (c.grade) {
        const gc = gradeColor(c.grade);
        // FIX 4: wider badge (22px) so "C+" / "A-" / "B-" etc. fit without clipping
        doc.setFillColor(gc[0], gc[1], gc[2], 0.15);
        doc.roundedRect(COL.grade, y - 0.5, 22, 5, 1, 1, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...gradeColor(c.grade));
        doc.text(c.grade, COL.grade + 11, y + 3.2, { align: 'center' });
      }
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
      // FIX 5: F(NT) note is 'No Transfer', retaken shows 'Retaken' only if actually retaken
      const note = c.grade === 'F(NT)' ? 'No Transfer'
        : isRet ? 'Retaken'
        : c.grade === 'P' ? 'Pass/Fail'
        : '';
      if (note) doc.text(note, COL.note, y + 3.2);
      y += 6;
    });
    y += 4;
  });

  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(0, PH - 10, PW, 10, 'F');
  doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
  doc.rect(0, PH - 10, PW, 0.8, 'F');
  doc.setFontSize(7);
  doc.setTextColor(GREY3[0], GREY3[1], GREY3[2]);
  doc.text('Generated by Shohoj · BRAC University CGPA Calculator', ML, PH - 4);
  doc.text(new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), PW - MR, PH - 4, { align: 'right' });

  doc.save('BRACU_CGPA_Report_Shohoj.pdf');
}