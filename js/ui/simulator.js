import { GRADES } from '../core/grades.js';
import { state } from '../core/state.js';
import { getRetakenKeys, getImprovementStrategy } from '../core/calculator.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { computeMilestoneLadder, visibleMilestoneRows } from '../core/milestones.js';
import { registerAction } from '../core/dispatch.js';

registerAction('sim:importTranscript', () => {
  document.getElementById('transcriptFileInput')?.click();
});
registerAction('sim:addSemester', () => window.addSemester?.());
registerAction('sim:toggleRetake', el => toggleRetake(el.dataset.key));
registerAction('sim:setRetakeRanking', el => setRetakeRanking(el.dataset.ranking));

const _retakeChecked = new Set();

// 'efficiency' — CGPA gain per credit spent (default). 'boost' — raw CGPA gain,
// the legacy order. See RetakeRanking in src/features/calculator/simulator.ts.
let _retakeRanking = 'efficiency';

export function setRetakeRanking(ranking) {
  if (ranking !== 'efficiency' && ranking !== 'boost') return;
  if (_retakeRanking === ranking) return;
  _retakeRanking = ranking;
  window._shohoj_recalc();
}

function clearRetakeSelections() {
  _retakeChecked.clear();
}

function pruneRetakeSelections(validKeys) {
  const valid = new Set(validKeys);
  for (const key of [..._retakeChecked]) {
    if (!valid.has(key)) _retakeChecked.delete(key);
  }
}

export function toggleRetake(key) {
  if (_retakeChecked.has(key)) _retakeChecked.delete(key);
  else _retakeChecked.add(key);
  window._shohoj_recalc();
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
  // treat summary block as "has courses" so wizard completes properly
  const hasCourses = hasSem && (
    state.semesters.some(s => !s.summary && s.courses.some(c => c.name.trim())) ||
    state.semesters.some(s => s.summary)
  );
  s1.className  = 'setup-step-num ' + (hasDept ? 'done' : 'active');
  if (si2) si2.className = 'setup-step-indicator ' + (hasSem ? 'step-done' : hasDept ? 'step-active' : '');
  s2.className  = 'setup-step-num ' + (hasSem ? 'done' : hasDept ? 'active' : '');
  if (si3) si3.className = 'setup-step-indicator ' + (hasCourses ? 'step-done' : hasSem ? 'step-active' : '');
  s3.className  = 'setup-step-num ' + (hasCourses ? 'done' : hasSem ? 'active' : '');
  const wizard  = document.getElementById('setupWizard');
  if (wizard) wizard.style.opacity = hasCourses ? '0.4' : '1';
}

/** The 7-tier needed-GPA → letter-range mapping (gpaLetterRange in
 * src/features/calculator/simulator.ts). Module-scoped so the plan table and
 * the goal ladder share one definition. */
function gpToLetter(gp) {
  if (gp >= 3.85) return 'All A';
  if (gp >= 3.50) return 'A / A-';
  if (gp >= 3.15) return 'B+ / A-';
  if (gp >= 2.85) return 'B / B+';
  if (gp >= 2.50) return 'B- / B';
  if (gp >= 2.15) return 'C+ / B-';
  return 'C / C+';
}

/** The goal ladder (#502). Row curation lives in the model
 * (visibleMilestoneRows) so this and the shell's MilestoneLadder share it. */
export function buildMilestoneLadder(currentPts, currentCredits, remaining) {
  const ladder = computeMilestoneLadder({
    points: currentPts,
    cgpaCredits: currentCredits,
    remaining,
  });
  if (!ladder) return '';

  const visible = visibleMilestoneRows(ladder);
  if (!visible.length) return '';

  const stateText = (row) => {
    if (row.state === 'secured') return 'Locked in';
    if (row.state === 'out-of-reach') return 'Out of reach';
    return `needs ${row.neededGpa.toFixed(2)} avg <span class="sim-ladder-letters">(${escHtml(gpToLetter(row.neededGpa))})</span>`;
  };

  const rows = visible.map(row => `
    <li class="sim-ladder-row sim-ladder-row--${escAttr(row.state)}">
      <span class="sim-ladder-goal">${escHtml(row.tier.goalLabel)} <span class="sim-ladder-thresh">(${row.tier.threshold.toFixed(2)})</span></span>
      <span class="sim-ladder-state">${stateText(row)}</span>
    </li>`).join('');

  return `
    <div class="sim-ladder">
      <div class="sim-ladder-heading">🪜 Where you can still land</div>
      <div class="sim-ladder-sub">Best still possible: <strong>${ladder.ceiling.toFixed(2)}</strong> · guaranteed floor: <strong>${ladder.floor.toFixed(2)}</strong></div>
      <ul class="sim-ladder-list">${rows}</ul>
    </div>`;
}

export function runSimulator(currentCgpa, currentCredits, currentPts) {
  const target = parseFloat(document.getElementById('targetCgpa').value);
  const remaining = parseFloat(document.getElementById('creditsRemaining').value);
  const resultEl = document.getElementById('simulatorResult');

  if (Number.isNaN(target) || Number.isNaN(remaining) || currentCgpa === null) {
    clearRetakeSelections();
    // Before a target is named, lead with what is still reachable (#502). The
    // ladder needs remaining credits but not a target, and those auto-fill from
    // the department, so there is usually something to say here.
    const ladderHtml =
      currentCgpa !== null && !Number.isNaN(remaining)
        ? buildMilestoneLadder(currentPts, currentCredits, remaining)
        : '';
    // ladderHtml carries no user input: every string in it comes from the
    // MILESTONE_TIERS constant or a toFixed() number, and is escaped anyway.
    // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    resultEl.innerHTML =
      '<span style="color:var(--text3);font-size:13px">Enter your target CGPA and remaining credits above to see what you need.</span>'
      + ladderHtml;
    return;
  }
  if (target > 4.0 || target < 0) {
    resultEl.innerHTML = '<span class="warn">Target CGPA must be between 0.0 and 4.0.</span>';
    return;
  }
  if (remaining < 0) {
    resultEl.innerHTML = '<span class="warn">Remaining credits cannot be negative.</span>';
    return;
  }
  if (remaining === 0) {
    if (target <= currentCgpa) {
      resultEl.innerHTML = `<div class="sim-result-card">
        <div style="padding:12px 14px;border-radius:10px;background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.22)">
          <div style="font-size:18px;font-weight:800;color:#2ECC71;font-family:'Syne',sans-serif">🎉 Target already secured</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">You have no remaining credits left, and your current CGPA <strong>${currentCgpa.toFixed(2)}</strong> already meets the target of <strong>${target.toFixed(2)}</strong>.</div>
        </div>
      </div>`;
    } else {
      resultEl.innerHTML = `<div class="sim-result-card">
        <div style="padding:12px 14px;border-radius:10px;background:rgba(231,76,60,0.06);border:1px solid rgba(231,76,60,0.25)">
          <div style="font-size:18px;font-weight:800;color:#e74c3c;font-family:'Syne',sans-serif">⛔ No remaining credits</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">You have no remaining credits left, so you cannot raise your CGPA to <strong>${target.toFixed(2)}</strong> through future semesters. Consider retakes if you want to improve beyond <strong>${currentCgpa.toFixed(2)}</strong>.</div>
        </div>
      </div>`;
    }
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
      <div class="sim-ba-left">
        <div class="sim-ba-block">
          <div class="sim-ba-label">Current CGPA</div>
          <div class="sim-ba-val">${currentCgpa.toFixed(2)}</div>
        </div>
        <div class="sim-ba-arrow">→</div>
        <div class="sim-ba-block">
          <div class="sim-ba-label">Target CGPA</div>
          <div class="sim-ba-val" style="color:${targetColor}">${target.toFixed(2)}</div>
        </div>
      </div>
      <div class="sim-ba-right">
        <div class="sim-ba-label">Avg GPA Needed</div>
        <div class="sim-ba-val" style="color:${neededColor}">${neededGPA.toFixed(2)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="font-size:10px;color:var(--text3)">over ${remaining} credits</span>
          <span class="sim-ba-delta">+${Math.max(0, target - currentCgpa).toFixed(2)}</span>
        </div>
      </div>
    </div>`;

    msg += `<div style="margin-bottom:12px">
      <div class="sim-difficulty-label"><span>${diffLabel}</span><span>${neededGPA.toFixed(2)} / 4.00</span></div>
      <div class="sim-difficulty-bar"><div class="sim-difficulty-fill ${diffClass}" style="width:${diffPct}%"></div></div>
    </div>`;

    let insight;
    if (neededGPA >= 3.9)      insight = `<span style="color:#e74c3c">Requires near-perfect grades every semester</span> — focus on strategic retakes below.`;
    else if (neededGPA >= 3.5) insight = `Challenging but doable — <span style="color:#F0A500">consistent B+/A- performance</span> needed across remaining semesters.`;
    else if (neededGPA >= 3.0) insight = `Very realistic — <span style="color:#2ECC71">avoid D/F grades</span> and stay consistent.`;
    else                       insight = `<span style="color:#2ECC71">You're in great shape!</span> Maintain current effort.`;
    msg += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">${insight}</div>`;

    const rows = [9, 12, 15].map(cr => {
      const semsNeeded = Math.ceil(remaining / cr);
      return `<tr>
        <td style="padding:4px 10px;color:var(--text2);text-align:center">${cr} cr/sem</td>
        <td style="padding:4px 10px;text-align:center;font-weight:700;font-size:13px;color:var(--text)">${semsNeeded} sem${semsNeeded!==1?'s':''}</td>
        <td style="padding:4px 10px;text-align:center;color:var(--text2)">${gpToLetter(neededGPA)}</td>
      </tr>`;
    }).join('');
    msg += `<div style="overflow-x:auto;margin-bottom:4px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">cr/sem</th>
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">semesters</th>
          <th style="padding:4px 10px;text-align:center;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:1px">avg grade</th>
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

  // ── Nudge: if user is using summary block with no detailed course data ──
  const hasSummaryBlock = state.semesters.some(s => s.summary);
  const hasDetailedCourses = state.semesters.some(s => !s.summary && !s.running && s.courses.some(c => c.name.trim() && c.grade));
  if (hasSummaryBlock && !hasDetailedCourses) {
    msg += `
      <div style="margin-top:16px;padding:14px 16px;border-radius:12px;background:rgba(86,180,233,0.07);border:1px solid rgba(86,180,233,0.22);display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:18px;flex-shrink:0;">💡</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">Unlock full potential</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.6;">
            You're using a CGPA summary — great for quick tracking! To unlock <strong>Smart Retake &amp; Repeat Strategy</strong>, <strong>Grade Changer</strong>, and <strong>Reverse Solver</strong>, import your transcript or add your past semester courses with grades.
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button data-action="sim:importTranscript" style="
              padding:7px 14px;border-radius:8px;
              background:rgba(86,180,233,0.12);border:1px solid rgba(86,180,233,0.3);
              color:#56B4E9;font-size:12px;font-weight:600;cursor:pointer;
              font-family:'DM Sans',sans-serif;
              transition:background 0.2s,border-color 0.2s;
            ">📄 Import Transcript</button>
            <button data-action="sim:addSemester" style="
              padding:7px 14px;border-radius:8px;
              background:rgba(46,204,113,0.10);border:1px solid rgba(46,204,113,0.25);
              color:#2ECC71;font-size:12px;font-weight:600;cursor:pointer;
              font-family:'DM Sans',sans-serif;
              transition:background 0.2s,border-color 0.2s;
            ">+ Add Past Semester</button>
          </div>
        </div>
      </div>`;
  } else {
    msg += buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target);
  }

  resultEl.innerHTML = msg;
}

export function buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target) {
  if (currentCgpa === null || !state.semesters.length) return '';

  const retakenKeys = getRetakenKeys();
  const candidates = [];

  // Whether a withdrawn course is still owed. getRetakenKeys supersedes by
  // comparing grade points, and a withdrawal has none, so a completed second
  // attempt never marks the W row as retaken — without this the student is
  // told to re-enroll in a course they already finished. Two withdrawals of
  // the same course collapse into one row for the same reason. Mirrors
  // computeRetakeCandidates in src/features/calculator/simulator.ts.
  const attemptedElsewhere = new Set();
  state.semesters.forEach(sem => {
    if (sem.summary) return;
    sem.courses.forEach(c => {
      const name = c.name.trim().toLowerCase();
      // A running row counts: the course is being taken now, not still owed.
      if (name && c.grade !== 'W' && (c.grade || sem.running)) attemptedElsewhere.add(name);
    });
  });
  const offeredWithdrawals = new Set();
  const stillOwed = rawName => {
    const name = rawName.trim().toLowerCase();
    if (attemptedElsewhere.has(name) || offeredWithdrawals.has(name)) return false;
    offeredWithdrawals.add(name);
    return true;
  };

  state.semesters.forEach(sem => {
    if (sem.running || sem.summary) return;
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.credits) return;
      const isWithdrawal = c.grade === 'W';
      const gp = GRADES[c.grade];
      // W is the one null-grade-point row that belongs here: a course still
      // owed, not a settled outcome like P or I (#499).
      if (!isWithdrawal && (gp === undefined || gp === null)) return;
      if (retakenKeys.has(`${sem.id}-${i}`)) return;
      if (!isWithdrawal && gp >= 3.0) return; // B and above — no improvement mechanism available
      if (isWithdrawal && !stillOwed(c.name)) return;

      const semLabel = sem.name.replace(/\s*\(.*\)$/, '');
      const key = `${c.name}||${semLabel}`;
      // A retake re-scores credits already in the divisor; a withdrawal adds
      // its credits to it, so the boost can come out negative. Mirrors
      // computeRetakeCandidates in src/features/calculator/simulator.ts.
      const cgpaAtTarget = t => (currentPts + c.credits * t) / (currentCredits + c.credits);
      const boostToB  = isWithdrawal ? cgpaAtTarget(3.0) - currentCgpa
                                     : c.credits * (3.0 - gp) / currentCredits;
      const boostToA  = isWithdrawal ? cgpaAtTarget(4.0) - currentCgpa
                                     : c.credits * (4.0 - gp) / currentCredits;
      const strategy  = getImprovementStrategy(c.grade); // 'retake' | 'repeat' | null
      candidates.push({ name: c.name, grade: c.grade, gp: isWithdrawal ? null : gp,
                        credits: c.credits, isWithdrawal,
                        sem: semLabel, key, boostToB, boostToA,
                        boostPerCredit: boostToB / c.credits, strategy });
    });
  });

  if (!candidates.length) {
    clearRetakeSelections();
    return '';
  }

  pruneRetakeSelections(candidates.map(c => c.key));

  // Sort first, cut second. Cutting by one order and then re-sorting would hide
  // the candidates the other ranking exists to surface.
  candidates.sort((a, b) => {
    const primary = _retakeRanking === 'efficiency'
      ? b.boostPerCredit - a.boostPerCredit
      : b.boostToB - a.boostToB;
    if (primary !== 0) return primary;
    const secondary = _retakeRanking === 'efficiency'
      ? b.boostToB - a.boostToB
      : b.boostPerCredit - a.boostPerCredit;
    if (secondary !== 0) return secondary;
    return a.key.localeCompare(b.key);
  });
  const top = candidates.slice(0, 6);

  const gradeCol = g =>
    (g === 'F' || g === 'F(NT)') ? '#e74c3c' :
    g === 'W' ? 'var(--text3)' : // absent outcome, not a poor one
    (g === 'D' || g === 'D-' || g === 'D+') ? '#e67e22' : '#F0A500';

  // ── Strategy badge HTML ────────────────────────────────────────────────────
  // Retake = F grade, must re-enroll for a full semester (up to 2 times)
  // Repeat = below B (non-F), can sit a special exam (once, within 2 semesters)
  //          No grade cap — same intake-based policy applies for CGPA
  // Withdrawn (#499): neither existing route fits — no failing grade to retake
  // and no result to sit a repeat exam against. The student enrols again, and
  // the tooltip states the cost: these credits join the CGPA rather than
  // replacing a grade, so the outcome can pull it down.
  const strategyBadge = (strategy, isWithdrawal) => {
    if (isWithdrawal) {
      return `<span style="
        font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;
        background:var(--chip-hover);color:var(--text3);
        border:1px solid var(--chip-border);
        border-radius:4px;padding:2px 6px;white-space:nowrap;
      " title="Withdrawn: no grade to improve. Enrolling again adds these credits to your CGPA rather than replacing a grade, so the result can pull your CGPA down as well as up.">Withdrawn</span>`;
    }
    if (strategy === 'repeat') {
      return `<span style="
        font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;
        background:rgba(86,180,233,0.12);color:#56B4E9;
        border:1px solid rgba(86,180,233,0.30);
        border-radius:4px;padding:2px 6px;white-space:nowrap;
      " title="Repeat: sit a special exam once within 2 semesters of initial enrollment. No grade cap — latest grade counts for CGPA.">Repeat</span>`;
    }
    return `<span style="
      font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;
      background:rgba(231,76,60,0.10);color:#e74c3c;
      border:1px solid rgba(231,76,60,0.28);
      border-radius:4px;padding:2px 6px;white-space:nowrap;
    " title="Retake: re-enroll in the course for a full semester. Allowed up to twice for F grades.">Retake</span>`;
  };

  let ptsAfter  = currentPts;
  let credAfter = currentCredits;

  const rows = top.map((c, idx) => {
    const checked = _retakeChecked.has(c.key);
    if (checked) {
      if (c.isWithdrawal) {
        // No grade to replace — the course joins the CGPA for the first time,
        // so both sides of the ratio move.
        ptsAfter  += c.credits * 3.0;
        credAfter += c.credits;
      } else {
        ptsAfter  += c.credits * (3.0 - c.gp);
      }
    }
    const cgpaIfB = Math.min(4.0, currentCgpa + c.boostToB).toFixed(2);
    const cgpaIfA = Math.min(4.0, currentCgpa + c.boostToA).toFixed(2);
    const chk = checked
      ? `<span style="color:#2ECC71;font-size:14px">☑</span>`
      : `<span style="color:var(--text3);font-size:14px">☐</span>`;
    const rowBg = checked ? 'background:rgba(29,185,84,0.07);' : '';
    const safeKey = escAttr(c.key);
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg}"
                data-action="sim:toggleRetake" data-key="${safeKey}">
      <td style="padding:6px 8px;font-size:12px">${chk}</td>
      <td style="padding:6px 8px;color:var(--text);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escAttr(c.name)}">${escHtml(c.name)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${escHtml(c.sem)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px">
        <span style="font-weight:700;color:${gradeCol(c.grade)}">${escHtml(c.grade)}</span>
        <span style="color:var(--text3)"> → </span>
        <span style="font-weight:700;color:#2ECC71">B</span>
      </td>
      <td style="padding:6px 8px;text-align:center">${strategyBadge(c.strategy, c.isWithdrawal)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)" title="Credits you spend to take this course again">${escHtml(String(c.credits))}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:700;color:${c.boostToB < 0 ? '#e74c3c' : '#2ECC71'}">${cgpaIfB}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${cgpaIfA} <span style="font-size:9px">(if A)</span></td>
    </tr>`;
  }).join('');

  // Recomputed from the adjusted totals rather than summed from the per-row
  // boosts: summing is exact only while the divisor holds still, which a
  // selected withdrawal breaks. For an all-retake selection the two agree.
  const cgpaAfterRetakes = Math.min(4.0, credAfter > 0 ? ptsAfter / credAfter : currentCgpa);
  const cumBoost = cgpaAfterRetakes - currentCgpa;
  const checkedCount = _retakeChecked.size;

  let retakeImpactHtml = '';
  if (checkedCount > 0 && target) {
    const remaining = parseFloat(document.getElementById('creditsRemaining').value) || 0;
    const newNeededPts = target * (credAfter + remaining) - ptsAfter;
    const newNeededGPA = remaining > 0 ? newNeededPts / remaining : null;
    const cgpaColor = cgpaAfterRetakes >= target ? '#2ECC71' : cgpaAfterRetakes >= 3.0 ? '#F0A500' : '#e74c3c';
    const targetLine = (newNeededGPA !== null && remaining > 0)
      ? (newNeededGPA > 4.0
          ? `Even with these improvements, reaching <strong>${target.toFixed(2)}</strong> requires more than perfect grades from remaining credits.`
          : newNeededGPA <= 0
          ? `🎉 With these improvements alone, you'd already exceed your target of <strong style="color:#2ECC71">${target.toFixed(2)}</strong>!`
          : `After these improvements, you'd need avg GPA <strong style="color:${newNeededGPA >= 3.5 ? '#F0A500' : '#2ECC71'}">${newNeededGPA.toFixed(2)}</strong> from your remaining <strong>${remaining}</strong> credits to hit <strong>${target.toFixed(2)}</strong>.`)
      : '';

    retakeImpactHtml = `
      <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(29,185,84,0.08);border:1px solid rgba(29,185,84,0.2)">
        <div style="font-size:12px;color:var(--text2)">
          ✅ <strong>${checkedCount} course${checkedCount > 1 ? 's' : ''} selected</strong> —
          CGPA goes from <strong>${currentCgpa.toFixed(2)}</strong> →
          <strong style="color:${cgpaColor};font-size:14px">${cgpaAfterRetakes.toFixed(2)}</strong>
          <span style="color:var(--text3);font-size:11px">(+${cumBoost.toFixed(2)} boost if all raised to B)</span>
        </div>
        ${targetLine ? `<div style="margin-top:6px;font-size:12px;color:var(--text2)">${targetLine}</div>` : ''}
      </div>`;
  } else if (checkedCount === 0) {
    retakeImpactHtml = `
      <div style="margin-top:8px;font-size:11px;color:var(--text3)">
        💡 Click any row to select it and see how your CGPA changes after those improvements.
      </div>`;
  }

  // ── Legend explaining the badges ──────────────────────────────────────────
  // The re-enroll entry appears only when a withdrawal is actually on the
  // table; unlike the two standing routes it describes a state most students
  // never have a row in.
  const hasWithdrawal = top.some(c => c.isWithdrawal);
  const legendHtml = `
    <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text3);">
      <span style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:9px;font-weight:700;background:rgba(231,76,60,0.10);color:#e74c3c;border:1px solid rgba(231,76,60,0.28);border-radius:4px;padding:1px 5px;">RETAKE</span>
        Re-enroll for a full semester (F grades, up to 2×)
      </span>
      <span style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:9px;font-weight:700;background:rgba(86,180,233,0.12);color:#56B4E9;border:1px solid rgba(86,180,233,0.30);border-radius:4px;padding:1px 5px;">REPEAT</span>
        Special exam, once, within 2 semesters (below B, no grade cap)
      </span>
      ${hasWithdrawal ? `<span style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:9px;font-weight:700;background:var(--chip-hover);color:var(--text3);border:1px solid var(--chip-border);border-radius:4px;padding:1px 5px;">WITHDRAWN</span>
        Adds credits instead of replacing a grade, so it can lower your CGPA
      </span>` : ''}
    </div>`;

  return `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:4px">
        🔁 Smart Retake &amp; Repeat Strategy
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
        ${_retakeRanking === 'efficiency'
          ? `Courses ranked by CGPA gained <strong style="color:#2ECC71">per credit spent</strong>, raising to B (3.0) — the cheapest lift first.`
          : `Courses ranked by total CGPA impact if raised to <strong style="color:#2ECC71">B (3.0)</strong>, whatever the credit cost.`}
        Click rows to simulate stacking improvements.
      </div>
      <div class="sim-retake-ranking" role="group" aria-label="Rank retake candidates by" style="margin-bottom:10px">
        <button type="button" class="sim-rank-chip${_retakeRanking === 'efficiency' ? ' active' : ''}"
                aria-pressed="${_retakeRanking === 'efficiency'}"
                data-action="sim:setRetakeRanking" data-ranking="efficiency">Best value</button>
        <button type="button" class="sim-rank-chip${_retakeRanking === 'boost' ? ' active' : ''}"
                aria-pressed="${_retakeRanking === 'boost'}"
                data-action="sim:setRetakeRanking" data-ranking="boost">Biggest jump</button>
      </div>
      <div style="overflow-x:auto">
        <table class="sim-retake-table" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="padding:4px 8px;width:24px"></th>
              <th style="padding:4px 8px;text-align:left;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Course</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Semester</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Grade → Target</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Type</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Credits</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (B)</th>
              <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (A)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${retakeImpactHtml}
      ${legendHtml}
    </div>`;
}