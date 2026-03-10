// ── CGPA CALCULATOR ENGINE ───────────────────────────
// calcSemGPA, recalc, autoDetectGrade, onPFChange.

import { GRADES, POINTS_TO_GRADE } from './grades.js';
import { semesters, whatIfMode, whatIfGrades, saveState } from './state.js';
import { detectGrade } from './helpers.js';
import { app }         from './registry.js';

function onPFChange(semId, cIdx, val) {
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].grade = val;
      sem.courses[cIdx].gradePoint = val;
      app.renderSemesters();
      app.recalc();
    }

    function autoDetectGrade(semId, cIdx, val, inputEl) {
      // Special case: typing "NT" sets F(NT) grade
      if (val.trim().toUpperCase() === 'NT') {
        const sem = semesters.find(s => s.id === semId);
        if (!sem) return;
        sem.courses[cIdx].grade = 'F(NT)';
        sem.courses[cIdx].gradePoint = 'NT';
        app.renderSemesters();
        app.recalc();
        return;
      }
      const letter = detectGrade(val);
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].grade = letter;
      sem.courses[cIdx].gradePoint = val;

      // Flash border green on valid grade
      if (letter) {
        inputEl.style.borderColor = 'rgba(46,204,113,0.6)';
        setTimeout(() => inputEl.style.borderColor = '', 600);
      }

      // Full re-render so retaken state, GPA badges all stay in sync
      app.renderSemesters();
      app.recalc();

      // Restore focus to the grade point input that was being typed in
      const block = document.getElementById(`sem-${semId}`);
      if (block) {
        const rows = block.querySelectorAll('.course-row:not(.course-header)');
        const gpInput = rows[cIdx]?.querySelector('input[inputmode="decimal"]');
        if (gpInput) {
          gpInput.focus();
          // Move cursor to end
          const len = gpInput.value.length;
          gpInput.setSelectionRange(len, len);
        }
      }
    }

    function calcSemGPA(sem) {
      // Semester GPA includes ALL courses taken that semester — retaken or not.
      // Only cumulative CGPA skips retaken rows.
      let pts = 0, creds = 0;
      sem.courses.forEach((c, i) => {
        const gp = GRADES[c.grade];
        if (gp === undefined || !c.credits) return;
        if (c.grade === 'P' || c.grade === 'I') return;
        // F(NT): counts toward sem GPA denominator as 0 pts
        if (c.grade === 'F(NT)') { creds += c.credits; return; }
        if (gp === null) return;
        pts += gp * c.credits;
        creds += c.credits;
      });
      return creds > 0 ? pts / creds : null;
    }

    const STORAGE_KEY = 'shohoj_cgpa_v1';


    function recalc() {
      let totalPts = 0, totalAttempted = 0, totalEarned = 0, totalEarnedCGPA = 0;
      const retakenKeys = getRetakenKeys();
      // For progress bar: retake keys considering only completed semesters
      const completedOnly = semesters.filter(s => !s.running);
      const retakenKeysCompleted = getRetakenKeys(completedOnly);
      for (const sem of semesters) {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits) return;
          if (c.grade === 'P' || c.grade === 'I') return;
          const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
          // BRACU counts ALL attempts toward credits attempted (excluding running sem)
          if (!sem.running) totalAttempted += c.credits;
          // Only the active (non-retaken) grade counts toward CGPA pts
          if (!isRetaken) {
            totalPts += gp * c.credits;
            // CGPA denominator: ATTEMPTED credits of active courses (includes F and F(NT))
            // BRACU formula: CGPA = totalPts / totalAttempted (not earned)
            // F(NT) = gp 0, null check excludes only P(null) and I(null)
            if (gp !== null) totalEarnedCGPA += c.credits;
          }
          // Credits earned for progress bar: completed sems only, using completed-only retake keys
          if (gp > 0 && !sem.running && !retakenKeysCompleted.has(`${sem.id}-${i}`)) totalEarned += c.credits;
        });
      }

      const cgpa = totalEarnedCGPA > 0 ? totalPts / totalEarnedCGPA : null;

      // ── WHAT-IF CGPA (uses whatIfGrades overrides) ────────────────────
      let whatIfPts = 0, whatIfCr = 0;
      if (whatIfMode && Object.keys(whatIfGrades).length > 0) {
        for (const sem of semesters) {
          sem.courses.forEach((c, i) => {
            const key = `${sem.id}-${i}`;
            const grade = whatIfGrades[key] || c.grade;
            const gp = GRADES[grade];
            if (gp === undefined || !c.credits || grade === 'P' || grade === 'I') return;
            if (retakenKeys.has(key)) return;
            if (gp !== null) { whatIfPts += gp * c.credits; whatIfCr += c.credits; }
          });
        }
      }
      const whatIfCgpa = whatIfCr > 0 ? whatIfPts / whatIfCr : null;

      // CGPA for completed semesters only (for meter + status bar)
      let completedPts = 0, completedEarned = 0;
      semesters.filter(s => !s.running).forEach(sem => {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
          if (retakenKeysCompleted.has(`${sem.id}-${i}`)) return;
          completedPts += gp * c.credits;
          // BRACU denominator = attempted credits (includes F and F(NT) with 0 pts)
          if (gp !== null) completedEarned += c.credits;
        });
      });
      const cgpaCompleted = completedEarned > 0 ? completedPts / completedEarned : null;
      const cgpaEl = document.getElementById('cgpaVal');
      cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
      const hasRunning = semesters.some(s => s.running);
      document.querySelector('.cgpa-label').textContent = hasRunning ? 'Projected CGPA' : 'Current CGPA';

      // Global incomplete warning
      const hasIncomplete = semesters.some(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade));
      let incWarn = document.getElementById('incompleteWarning');
      if (!incWarn) {
        incWarn = document.createElement('div');
        incWarn.id = 'incompleteWarning';
        incWarn.className = 'incomplete-warning';
        const meter = document.querySelector('.cgpa-meter');
        if (meter) meter.parentNode.insertBefore(incWarn, meter.nextSibling);
      }
      if (hasIncomplete) {
        const count = semesters.filter(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade)).length;
        incWarn.textContent = `⚠ ${count} semester${count > 1 ? 's have' : ' has'} missing grades — CGPA may be inaccurate`;
        incWarn.style.display = '';
      } else {
        incWarn.style.display = 'none';
      }
      // Show what-if preview
      let wiPreview = document.getElementById('whatIfPreview');
      if (!wiPreview) {
        wiPreview = document.createElement('div');
        wiPreview.id = 'whatIfPreview';
        wiPreview.className = 'whatif-cgpa-preview';
        const meterBox = document.querySelector('.cgpa-meter');
        if (meterBox) meterBox.insertAdjacentElement('afterend', wiPreview);
      }
      if (whatIfMode && whatIfCgpa !== null && cgpa !== null) {
        const delta = whatIfCgpa - cgpa;
        const sign  = delta >= 0 ? '+' : '';
        wiPreview.innerHTML = `
          <span class="whatif-cgpa-label">🔮 What-if CGPA</span>
          <span class="whatif-cgpa-val">${whatIfCgpa.toFixed(2)}</span>
          <span class="whatif-cgpa-delta">${sign}${delta.toFixed(2)}</span>
          <span style="font-size:11px;color:var(--text3);margin-left:4px">(vs current ${cgpa.toFixed(2)})</span>`;
        wiPreview.style.display = 'flex';
      } else {
        wiPreview.style.display = 'none';
      }

      cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
        cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
        cgpa >= 2.5 ? '#F0A500' : '#e74c3c';

      document.getElementById('totalAttempted').textContent = totalAttempted.toFixed(1);
      document.getElementById('totalEarned').textContent = totalEarned.toFixed(1);

      // ── CREDITS PROGRESS BAR ──────────────────────────
      const dept = currentDept ? DEPARTMENTS[currentDept] : null;
      const totalRequired = dept ? dept.totalCredits : 0;
      const creditsBox = document.getElementById('creditsProgressBox');
      if (dept && totalRequired > 0) {
        creditsBox.style.display = '';
        const creditsPct = Math.min((totalEarned / totalRequired) * 100, 100);
        document.getElementById('creditsFill').style.width = creditsPct.toFixed(1) + '%';
        document.getElementById('creditsPct').textContent = creditsPct.toFixed(1) + '%';
        document.getElementById('creditsEarnedLabel').textContent = totalEarned.toFixed(0) + ' credits completed';
        document.getElementById('creditsTotalLabel').textContent = 'of ' + totalRequired;
      } else {
        creditsBox.style.display = 'none';
      }

      // ── ACADEMIC STANDING ─────────────────────────────
      const standingBox = document.getElementById('standingBox');
      const cgpaNum = cgpaCompleted; // standing based on completed sems only
      const semCount = semesters.filter(s => s.courses.some(c => c.grade && GRADES[c.grade] !== undefined && GRADES[c.grade] !== null && c.credits > 0)).length;

      if (cgpaNum !== null) {
        standingBox.style.display = '';
        const title  = document.getElementById('standingTitle');
        const desc   = document.getElementById('standingDesc');
        const badge  = document.getElementById('standingBadge');
        // remove old standing classes
        standingBox.classList.remove('standing-excellent','standing-good','standing-warning','standing-danger');

        let standing, cls, emoji, description;

        if (cgpaNum >= 3.97) {
          standing = 'Perfect Standing'; cls = 'standing-excellent'; emoji = '🏆';
          description = 'Exceptional academic performance. You are at the top of your class.';
        } else if (cgpaNum >= 3.65) {
          standing = 'Higher Distinction'; cls = 'standing-excellent'; emoji = '🌟';
          description = 'Outstanding performance. You qualify for graduation with Higher Distinction (CGPA ≥ 3.65).';
        } else if (cgpaNum >= 3.50) {
          standing = 'Distinction'; cls = 'standing-excellent'; emoji = '⭐';
          description = 'Excellent academic record. You qualify for graduation with Distinction (CGPA ≥ 3.50).';
        } else if (cgpaNum >= 3.00) {
          standing = 'Good Standing'; cls = 'standing-good'; emoji = '✅';
          description = 'You are in good academic standing. Keep it up!';
        } else if (cgpaNum >= 2.50) {
          standing = 'Satisfactory'; cls = 'standing-good'; emoji = '👍';
          description = 'Acceptable academic performance. There is room to improve.';
        } else if (cgpaNum >= 2.00) {
          standing = 'Needs Improvement'; cls = 'standing-warning'; emoji = '⚠️';
          description = 'Your CGPA is below 2.50. Consistent improvement is needed to stay in good standing.';
        } else {
          standing = 'Academic Probation'; cls = 'standing-danger'; emoji = '❌';
          description = 'CGPA below 2.00 — you are on academic probation as per BRACU policy (Summer 2022+). Seek academic counselling immediately.';
        }

        standingBox.classList.add(cls);
        title.textContent  = standing;
        desc.textContent   = description;
        badge.textContent  = emoji;
      } else {
        standingBox.style.display = 'none';
      }

      // ── GPA TREND CHART ───────────────────────────────
      const trendBox = document.getElementById('trendChartBox');
      const trendCanvas = document.getElementById('trendCanvas');

      // Gather per-semester GPAs (only semesters with at least one graded course)
      const semGPAs = [];
      semesters.forEach(sem => {
        if (sem.running) return; // exclude running semester from trend chart
        const gpa = calcSemGPA(sem);
        if (gpa !== null) {
          // Get short label e.g. "Fall 25"
          const label = sem.name
            ? sem.name.replace(/\s*\(.*\)$/, '').replace(/(\d{4})/, y => "'" + y.slice(2))
            : `S${sem.id + 1}`;
          semGPAs.push({ label, gpa });
        }
      });

      if (semGPAs.length >= 2) {
        trendBox.style.display = '';

        // High / low range label
        const gpas = semGPAs.map(d => d.gpa);
        const first = gpas[0];
        const last  = gpas[gpas.length - 1];
        const diff  = last - first;
        let trendLabel, trendColor;
        if (Math.abs(diff) < 0.1) {
          trendLabel = '→ Stable';    trendColor = 'var(--text3)';
        } else if (diff > 0) {
          trendLabel = '↑ Improving'; trendColor = '#2ECC71';
        } else {
          trendLabel = '↓ Declining'; trendColor = '#e74c3c';
        }
        const trendEl = document.getElementById('trendRange');
        trendEl.textContent = trendLabel;
        trendEl.style.color = trendColor;
        trendEl.style.fontWeight = '600';

        // Draw on next frame so canvas has layout dimensions
        requestAnimationFrame(() => app.drawTrendChart(trendCanvas, semGPAs));
      } else {
        trendBox.style.display = 'none';
      }

      const pct = cgpaCompleted !== null ? Math.min((cgpaCompleted / 4) * 100, 100) : 0;
      document.getElementById('meterFill').style.width = pct + '%';
      document.getElementById('meterPct').textContent = cgpaCompleted !== null ? pct.toFixed(1) + '%' : '0%';

      const statusEl = document.getElementById('meterStatus');
      if (cgpa === null) {
        statusEl.innerHTML = 'Add your courses to get started.';
      } else if (cgpaCompleted >= 3.75) {
        statusEl.innerHTML = `<strong>Outstanding!</strong> CGPA ${cgpaCompleted.toFixed(2)} — Dean's List territory. Keep it up.`;
      } else if (cgpaCompleted >= 3.5) {
        statusEl.innerHTML = `<strong>Excellent.</strong> CGPA ${cgpaCompleted.toFixed(2)} — You're on track for a strong degree.`;
      } else if (cgpaCompleted >= 3.0) {
        statusEl.innerHTML = `<strong>Good standing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Push for 3.5 and you'll stand out.`;
      } else if (cgpaCompleted >= 2.5) {
        statusEl.innerHTML = `<strong>Keep pushing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Consider retaking weak courses for a boost.`;
      } else {
        statusEl.innerHTML = `<strong>Recovery mode.</strong> CGPA ${cgpa.toFixed(2)} — Focus on retakes and consistent grades from here.`;
      }

      app.runSimulator(cgpa, totalEarnedCGPA, totalPts);
      saveState();
      app.updateSetupWizard();
    }

export { onPFChange, autoDetectGrade, calcSemGPA, recalc };