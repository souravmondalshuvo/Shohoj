import { GRADES } from '../core/grades.js';
import { state } from '../core/state.js';
import { getRetakenKeys } from '../core/calculator.js';

const _retakeChecked = new Set();

export function toggleRetake(key) {
  if (_retakeChecked.has(key)) _retakeChecked.delete(key);
  else _retakeChecked.add(key);
  window._shohoj_recalc();
}

export function buildWhatIfSelect(semId, cIdx, currentGrade) {
  const key = semId + '-' + cIdx;
  const selected = state.whatIfGrades[key] || currentGrade;
  const grades = Object.keys(GRADES).filter(g => g !== 'P' && g !== 'I' && g !== 'F(NT)');
  const opts = grades.map(g =>
    '<option value="' + g + '"' + (selected === g ? ' selected' : '') + '>?' + g + '</option>'
  ).join('');
  return '<select class="whatif-grade-select" style="font-size:10px;padding:1px 4px;' +
         'border-radius:5px;max-width:64px;cursor:pointer;" ' +
         'onchange="onWhatIfChange(' + semId + ',' + cIdx + ',this.value)" ' +
         'title="What-if grade">' + opts + '</select>';
}

export function onWhatIfChange(semId, cIdx, grade) {
  state.whatIfGrades[semId + '-' + cIdx] = grade;
  window._shohoj_recalc();
}

export function toggleWhatIf() {
  state.whatIfMode = !state.whatIfMode;
  if (!state.whatIfMode) {
    Object.keys(state.whatIfGrades).forEach(k => delete state.whatIfGrades[k]);
  }
  const btn = document.getElementById('whatIfBtn');
  if (btn) {
    btn.style.background  = state.whatIfMode ? 'rgba(240,165,0,0.15)' : '';
    btn.style.borderColor = state.whatIfMode ? 'rgba(240,165,0,0.5)'  : '';
    btn.style.color       = state.whatIfMode ? '#F0A500' : '';
    btn.textContent       = state.whatIfMode ? '🔮 Exit What-if' : '🔮 What-if';
  }
  window._shohoj_renderAndRecalc();
}

export function updateSetupWizard() {
  const s1  = document.getElementById('stepNum1');
  const s2  = document.getElementById('stepNum2');
  const s3  = document.getElementById('stepNum3');
  const si2 = document.getElementById('stepIndicator2');
  const si3 = document.getElementById('stepIndicator3');
  if (!s1) return;
  const hasDept    = !!state.currentDept;
  const hasSem     = hasDept && (document.getElementById('startSeason')?.value) && (document.getElementById('startYear')?.value);
  const hasCourses = hasSem && state.semesters.length > 0;
  s1.className  = 'setup-step-num ' + (hasDept ? 'done' : 'active');
  if (si2) si2.className = 'setup-step-indicator ' + (hasSem ? 'step-done' : hasDept ? 'step-active' : '');
  s2.className  = 'setup-step-num ' + (hasSem ? 'done' : hasDept ? 'active' : '');
  if (si3) si3.className = 'setup-step-indicator ' + (hasCourses ? 'step-done' : hasSem ? 'step-active' : '');
  s3.className  = 'setup-step-num ' + (hasCourses ? 'done' : hasSem ? 'active' : '');
  const wizard  = document.getElementById('setupWizard');
  if (wizard) wizard.style.opacity = hasCourses ? '0.4' : '1';
}

export function runSimulator(currentCgpa, currentCredits, currentPts) {
  const target = parseFloat(document.getElementById('targetCgpa').value);
  const remaining = parseFloat(document.getElementById('creditsRemaining').value);
  const resultEl = document.getElementById('simulatorResult');

  if (!target || !remaining || currentCgpa === null) {
    resultEl.innerHTML = '<span style="color:var(--text3);font-size:13px">Enter your target CGPA and remaining credits above to see what you need.</span>';
    return;
  }
  if (target > 4.0 || target < 0) {
    resultEl.innerHTML = '<span class="warn">Target CGPA must be between 0.0 and 4.0.</span>';
    return;
  }

  const totalCredits = currentCredits + remaining;
  const neededPts    = target * totalCredits - currentPts;
  const neededGPA    = neededPts / remaining;

  const diffPct   = Math.min(100, Math.round((neededGPA / 4.0) * 100));
  const diffClass = neededGPA >= 3.8 ? 'hard' : neededGPA >= 3.2 ? 'medium' : 'easy';
  const diffLabel = neededGPA >= 3.8 ? '🔴 Very Hard' : neededGPA >= 3.2 ? '🟡 Challenging' : '🟢 Achievable';
  const neededColor = neededGPA >= 3.8 ? '#e74c3c' : neededGPA >= 3.2 ? '#F0A500' : '#2ECC71';
  const targetColor = target >= 3.5 ? '#2ECC71' : target >= 3.0 ? '#F0A500' : 'var(--text)';

  let msg = '<div class="sim-result-card">';

  if (neededGPA <= 4.0 && neededGPA >= 0) {
    msg += `<div class="sim-before-after">
      <div class="sim-ba-block">
        <div class="sim-ba-label">Current CGPA</div>
        <div class="sim-ba-val">${currentCgpa.toFixed(2)}</div>
      </div>
      <div class="sim-ba-arrow">→</div>
      <div class="sim-ba-block">
        <div class="sim-ba-label">Target CGPA</div>
        <div class="sim-ba-val" style="color:${targetColor}">${target.toFixed(2)}</div>
      </div>
      <div style="flex:1;min-width:80px">
        <div class="sim-ba-label">Avg GPA Needed</div>
        <div class="sim-ba-val" style="color:${neededColor}">${neededGPA.toFixed(2)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">over ${remaining} credits</div>
      </div>
      <div class="sim-ba-delta">+${Math.max(0, target - currentCgpa).toFixed(2)}</div>
    </div>`;

    msg += `<div style="margin-bottom:12px">
      <div class="sim-difficulty-label"><span>${diffLabel}</span><span>${neededGPA.toFixed(2)} / 4.00</span></div>
      <div class="sim-difficulty-bar"><div class="sim-difficulty-fill ${diffClass}" style="width:${diffPct}%"></div></div>
    </div>`;

    let insight = '';
    if (neededGPA >= 3.9)      insight = `<span style="color:#e74c3c">Requires near-perfect grades every semester</span> — focus on strategic retakes below.`;
    else if (neededGPA >= 3.5) insight = `Challenging but doable — <span style="color:#F0A500">consistent B+/A- performance</span> needed across remaining semesters.`;
    else if (neededGPA >= 3.0) insight = `Very realistic — <span style="color:#2ECC71">avoid D/F grades</span> and stay consistent.`;
    else                       insight = `<span style="color:#2ECC71">You're in great shape!</span> Maintain current effort.`;
    msg += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">${insight}</div>`;

    const gpToLetter = gp => {
      if (gp >= 3.85) return 'All A';
      if (gp >= 3.50) return 'A / A-';
      if (gp >= 3.15) return 'B+ / A-';
      if (gp >= 2.85) return 'B / B+';
      if (gp >= 2.50) return 'B- / B';
      if (gp >= 2.15) return 'C+ / B-';
      return 'C / C+';
    };
    const rows = [9, 12, 15].map(cr => {
      const semsNeeded = Math.ceil(remaining / cr);
      return `<tr>
        <td style="padding:4px 10px;color:var(--text2);text-align:center">${cr} cr/sem</td>
        <td style="padding:4px 10px;color:var(--text3);text-align:center">${semsNeeded} sem${semsNeeded!==1?'s':''}</td>
        <td style="padding:4px 10px;text-align:center;font-weight:700;color:${neededColor}">${neededGPA.toFixed(2)}</td>
        <td style="padding:4px 10px;text-align:center;color:var(--text2)">${gpToLetter(neededGPA)}</td>
      </tr>`;
    }).join('');
    msg += `<div style="overflow-x:auto;margin-bottom:4px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">cr/sem</th>
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">semesters</th>
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">gpa needed</th>
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">~grades</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  } else if (neededGPA > 4.0) {
    const ceiling = ((4.0 * remaining + currentPts) / totalCredits).toFixed(2);
    msg += `<div class="sim-before-after" style="border-color:rgba(231,76,60,0.25);background:rgba(231,76,60,0.06)">
      <div class="sim-ba-block">
        <div class="sim-ba-label">Current CGPA</div>
        <div class="sim-ba-val">${currentCgpa.toFixed(2)}</div>
      </div>
      <div class="sim-ba-arrow" style="color:#e74c3c">✗</div>
      <div class="sim-ba-block">
        <div class="sim-ba-label">Your Ceiling</div>
        <div class="sim-ba-val red">${ceiling}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">with all A grades</div>
      </div>
    </div>
    <div style="font-size:12px;color:#e74c3c;margin-bottom:10px">
      ⛔ Target ${target.toFixed(2)} is out of reach from ${remaining} remaining credits.
      Consider lowering your goal or using strategic retakes below to raise your ceiling.
    </div>`;
  } else {
    msg += `<div style="padding:12px 14px;border-radius:10px;background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.22)">
      <div style="font-size:18px;font-weight:800;color:#2ECC71;font-family:'Syne',sans-serif">🎉 Already achieved!</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">Your CGPA ${currentCgpa.toFixed(2)} already meets the target of ${target.toFixed(2)}. Set a higher goal!</div>
    </div>`;
  }

  msg += '</div>';
  msg += buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target);
  resultEl.innerHTML = msg;
}

export function buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target) {
  if (currentCgpa === null || !state.semesters.length) return '';

  const retakenKeys = getRetakenKeys();
  const candidates = [];

  state.semesters.forEach(sem => {
    if (sem.running) return;
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.credits) return;
      const gp = GRADES[c.grade];
      if (gp === undefined || gp === null) return;
      if (retakenKeys.has(`${sem.id}-${i}`)) return;
      if (gp >= 3.0) return;

      const semLabel = sem.name.replace(/\s*\(.*\)$/, '');
      const key = `${c.name}||${semLabel}`;
      const boostToB  = c.credits * (3.0 - gp) / currentCredits;
      const boostToA  = c.credits * (4.0 - gp) / currentCredits;
      candidates.push({ name: c.name, grade: c.grade, gp, credits: c.credits,
                        sem: semLabel, key, boostToB, boostToA });
    });
  });

  if (!candidates.length) return '';

  candidates.sort((a, b) => b.boostToB - a.boostToB);
  const top = candidates.slice(0, 6);

  for (const k of [..._retakeChecked]) {
    if (!top.find(c => c.key === k)) _retakeChecked.delete(k);
  }

  const gradeCol = g =>
    (g === 'F' || g === 'F(NT)') ? '#e74c3c' :
    (g === 'D' || g === 'D-' || g === 'D+') ? '#e67e22' : '#F0A500';

  let cumBoost = 0;
  let ptsAfter  = currentPts;
  let credAfter = currentCredits;

  const rows = top.map((c, idx) => {
    const checked = _retakeChecked.has(c.key);
    if (checked) { cumBoost += c.boostToB; ptsAfter += c.credits * (3.0 - c.gp); }
    const cgpaIfB = Math.min(4.0, currentCgpa + c.boostToB).toFixed(2);
    const cgpaIfA = Math.min(4.0, currentCgpa + c.boostToA).toFixed(2);
    const chk = checked
      ? `<span style="color:#2ECC71;font-size:14px">☑</span>`
      : `<span style="color:var(--text3);font-size:14px">☐</span>`;
    const rowBg = checked ? 'background:rgba(29,185,84,0.07);' : '';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg}"
                onclick="window._toggleRetake('${c.key.replace(/'/g,"\\'")}')">
      <td style="padding:6px 8px;font-size:12px">${chk}</td>
      <td style="padding:6px 8px;color:var(--text);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${c.sem}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px">
        <span style="font-weight:700;color:${gradeCol(c.grade)}">${c.grade}</span>
        <span style="color:var(--text3)"> → </span>
        <span style="font-weight:700;color:#2ECC71">B</span>
      </td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:700;color:#2ECC71">${cgpaIfB}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${cgpaIfA} <span style="font-size:9px">(if A)</span></td>
    </tr>`;
  }).join('');

  const cgpaAfterRetakes = Math.min(4.0, currentCgpa + cumBoost);
  const checkedCount = _retakeChecked.size;

  let retakeImpactHtml = '';
  if (checkedCount > 0 && target) {
    const remaining = parseFloat(document.getElementById('creditsRemaining').value) || 0;
    const newNeededPts = target * (credAfter + remaining) - ptsAfter;
    const newNeededGPA = remaining > 0 ? newNeededPts / remaining : null;
    const cgpaColor = cgpaAfterRetakes >= target ? '#2ECC71' : cgpaAfterRetakes >= 3.0 ? '#F0A500' : '#e74c3c';
    const targetLine = (newNeededGPA !== null && remaining > 0)
      ? (newNeededGPA > 4.0
          ? `Even with these retakes, reaching <strong>${target.toFixed(2)}</strong> requires more than perfect grades from remaining credits.`
          : newNeededGPA <= 0
          ? `🎉 With these retakes alone, you'd already exceed your target of <strong style="color:#2ECC71">${target.toFixed(2)}</strong>!`
          : `After these retakes, you'd need avg GPA <strong style="color:${newNeededGPA >= 3.5 ? '#F0A500' : '#2ECC71'}">${newNeededGPA.toFixed(2)}</strong> from your remaining <strong>${remaining}</strong> credits to hit <strong>${target.toFixed(2)}</strong>.`)
      : '';

    retakeImpactHtml = `
      <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(29,185,84,0.08);border:1px solid rgba(29,185,84,0.2)">
        <div style="font-size:12px;color:var(--text2)">
          ✅ <strong>${checkedCount} retake${checkedCount > 1 ? 's' : ''} selected</strong> —
          CGPA goes from <strong>${currentCgpa.toFixed(2)}</strong> →
          <strong style="color:${cgpaColor};font-size:14px">${cgpaAfterRetakes.toFixed(2)}</strong>
          <span style="color:var(--text3);font-size:11px">(+${cumBoost.toFixed(2)} boost if all raised to B)</span>
        </div>
        ${targetLine ? `<div style="margin-top:6px;font-size:12px;color:var(--text2)">${targetLine}</div>` : ''}
      </div>`;
  } else if (checkedCount === 0) {
    retakeImpactHtml = `
      <div style="margin-top:8px;font-size:11px;color:var(--text3)">
        💡 Click any row to select it and see how your CGPA changes after those retakes.
      </div>`;
  }

  return `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:4px">
        🔁 Smart Retake Strategy
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
        Courses ranked by CGPA impact if raised to <strong style="color:#2ECC71">B (3.0)</strong>. Click rows to simulate stacking retakes.
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="padding:4px 8px;width:24px"></th>
              <th style="padding:4px 8px;text-align:left;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Course</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Semester</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Grade → Target</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (B)</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (A)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${retakeImpactHtml}
    </div>`;
}

// ── RETAKE IMPACT ANALYZER (standalone panel) ─────────────────────────────────
const _retakeAnalyzerSelected = {};  // key → targetGrade

export function toggleRetakeAnalyzer(key, defaultGrade) {
  if (_retakeAnalyzerSelected[key]) {
    delete _retakeAnalyzerSelected[key];
  } else {
    _retakeAnalyzerSelected[key] = defaultGrade || 'A';
  }
  window._shohoj_recalc();
}

export function onRetakeTargetChange(key, grade) {
  _retakeAnalyzerSelected[key] = grade;  // auto-selects row if not already selected
  window._shohoj_recalc();
}

export function renderRetakeAnalyzer(currentCgpa, currentCredits, currentPts) {
  const box = document.getElementById('retakeAnalyzerBox');
  const content = document.getElementById('retakeAnalyzerContent');
  const preview = document.getElementById('retakeCgpaPreview');
  if (!box || !content) return;

  if (currentCgpa === null || !state.semesters.length) {
    box.style.display = 'none';
    return;
  }

  const retakenKeys = getRetakenKeys();
  const candidates = [];

  state.semesters.forEach(sem => {
    if (sem.running) return;
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.credits) return;
      const gp = GRADES[c.grade];
      if (gp === undefined || gp === null) return;
      if (retakenKeys.has(`${sem.id}-${i}`)) return;
      if (gp >= 3.0) return;  // only show courses below B

      const semLabel = sem.name ? sem.name.replace(/\s*\(.*\)$/, '') : '';
      const key = `${sem.id}-${i}`;
      const boostIfA = (c.credits * (4.0 - gp)) / currentCredits;
      const boostIfB = (c.credits * (3.0 - gp)) / currentCredits;
      candidates.push({
        name: c.name, grade: c.grade, gp, credits: c.credits,
        sem: semLabel, key, boostIfA, boostIfB, semId: sem.id, idx: i
      });
    });
  });

  if (!candidates.length) {
    box.style.display = 'none';
    return;
  }

  box.style.display = '';
  candidates.sort((a, b) => b.boostIfA - a.boostIfA);

  // Clean stale selections
  Object.keys(_retakeAnalyzerSelected).forEach(k => {
    if (!candidates.find(c => c.key === k)) delete _retakeAnalyzerSelected[k];
  });

  const gradeColor = g => {
    if (g === 'F') return '#e74c3c';
    if (g === 'D' || g === 'D+') return '#e67e22';
    if (g === 'C-' || g === 'C' || g === 'C+') return '#F0A500';
    if (g === 'B-') return '#3498db';
    return 'var(--text2)';
  };

  const targetGrades = [
    { grade: 'A',  gp: 4.00 },
    { grade: 'A-', gp: 3.70 },
    { grade: 'B+', gp: 3.30 },
    { grade: 'B',  gp: 3.00 },
  ];

  // Calculate cumulative impact
  let cumBoostPts = 0;
  let selectedCount = 0;
  candidates.forEach(c => {
    const sel = _retakeAnalyzerSelected[c.key];
    if (sel) {
      selectedCount++;
      const targetGp = GRADES[sel] || 3.0;
      cumBoostPts += c.credits * (targetGp - c.gp);
    }
  });
  const cgpaAfter = currentCredits > 0 ? (currentPts + cumBoostPts) / currentCredits : currentCgpa;
  const cgpaDelta = cgpaAfter - currentCgpa;

  // Preview display
  if (selectedCount > 0) {
    const afterColor = cgpaAfter >= 3.5 ? '#2ECC71' : cgpaAfter >= 3.0 ? '#27ae60' : cgpaAfter >= 2.5 ? '#F0A500' : '#e74c3c';
    preview.innerHTML = `
      <div class="retake-preview-current">
        <div class="retake-preview-label">Current</div>
        <div class="retake-preview-val">${currentCgpa.toFixed(2)}</div>
      </div>
      <div class="retake-preview-arrow">→</div>
      <div class="retake-preview-after">
        <div class="retake-preview-label">After Retakes</div>
        <div class="retake-preview-val" style="color:${afterColor}">${cgpaAfter.toFixed(2)}</div>
      </div>
      <div class="retake-preview-delta" style="color:#2ECC71">+${cgpaDelta.toFixed(2)}</div>`;
    preview.style.display = 'flex';
  } else {
    preview.innerHTML = '';
    preview.style.display = 'none';
  }

  // Build rows
  const rows = candidates.map(c => {
    const isSelected = !!_retakeAnalyzerSelected[c.key];
    const selectedGrade = _retakeAnalyzerSelected[c.key] || 'A';
    const selectedGp = GRADES[selectedGrade] || 4.0;
    const individualBoost = (c.credits * (selectedGp - c.gp)) / currentCredits;
    const cgpaIfThis = Math.min(4.0, currentCgpa + individualBoost);

    const opts = targetGrades.map(t =>
      `<option value="${t.grade}"${selectedGrade === t.grade ? ' selected' : ''}>${t.grade} (${t.gp.toFixed(1)})</option>`
    ).join('');

    const checkIcon = isSelected
      ? '<span class="retake-check on">✓</span>'
      : '<span class="retake-check">○</span>';

    const rowClass = isSelected ? 'retake-row selected' : 'retake-row';
    const boostText = `+${individualBoost.toFixed(2)}`;

    // Truncate long course names for display
    const displayName = c.name.length > 45 ? c.name.slice(0, 42) + '...' : c.name;
    const safeName = c.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    return `
      <div class="${rowClass}" data-key="${c.key}">
        <div class="retake-row-check" onclick="toggleRetakeAnalyzer('${c.key}','${selectedGrade}')">${checkIcon}</div>
        <div class="retake-row-info">
          <div class="retake-row-name" title="${safeName}">${displayName}</div>
          <div class="retake-row-meta">
            <span class="retake-row-sem">${c.sem}</span>
            <span class="retake-row-cr">${c.credits} cr</span>
          </div>
        </div>
        <div class="retake-row-grade">
          <span class="retake-current-grade" style="color:${gradeColor(c.grade)}">${c.grade}</span>
          <span class="retake-arrow">→</span>
          <select class="retake-target-select" onchange="onRetakeTargetChange('${c.key}',this.value)"
            ${!isSelected ? 'style="opacity:0.35"' : ''}>
            ${opts}
          </select>
        </div>
        <div class="retake-row-impact">
          <div class="retake-impact-cgpa">${cgpaIfThis.toFixed(2)}</div>
          <div class="retake-impact-boost" style="color:#2ECC71">${boostText}</div>
        </div>
      </div>`;
  }).join('');

  // Summary bar
  let summaryHtml = '';
  if (selectedCount > 0) {
    let insight = '';
    if (cgpaAfter >= 3.5 && currentCgpa < 3.5) {
      insight = `These retakes could push you into <strong style="color:#2ECC71">Distinction</strong> territory.`;
    } else if (cgpaAfter >= 3.0 && currentCgpa < 3.0) {
      insight = `These retakes would bring you back to <strong style="color:#2ECC71">Good Standing</strong>.`;
    } else if (cgpaAfter >= 2.0 && currentCgpa < 2.0) {
      insight = `These retakes could help you <strong style="color:#F0A500">exit academic probation</strong>.`;
    } else if (cgpaDelta >= 0.3) {
      insight = `A <strong style="color:#2ECC71">${cgpaDelta.toFixed(2)}</strong> boost — significant improvement from ${selectedCount} retake${selectedCount > 1 ? 's' : ''}.`;
    } else if (cgpaDelta >= 0.1) {
      insight = `A meaningful <strong style="color:#2ECC71">+${cgpaDelta.toFixed(2)}</strong> bump. Every fraction counts.`;
    } else {
      insight = `Small but steady — <strong>+${cgpaDelta.toFixed(2)}</strong> improvement.`;
    }
    summaryHtml = `
      <div class="retake-summary">
        <div class="retake-summary-count">${selectedCount} retake${selectedCount > 1 ? 's' : ''} selected</div>
        <div class="retake-summary-insight">${insight}</div>
      </div>`;
  } else {
    summaryHtml = `
      <div class="retake-hint">
        Click the circle next to any course to select it for retake analysis.
      </div>`;
  }

  content.innerHTML = `
    <div class="retake-table-header">
      <div class="retake-th-check"></div>
      <div class="retake-th-course">Course</div>
      <div class="retake-th-grade">Current → Target</div>
      <div class="retake-th-impact">CGPA Impact</div>
    </div>
    ${rows}
    ${summaryHtml}`;
}