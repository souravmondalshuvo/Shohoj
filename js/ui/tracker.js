import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state } from '../core/state.js';
import { calcSemGPA } from '../core/calculator.js';
import { getStartSeason, getStartYear, escHtml } from '../core/helpers.js';

export function renderDegreeTracker(totalEarned) {
  const box = document.getElementById('degreeTrackerBox');
  if (!box) return;

  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const totalRequired = dept ? dept.totalCredits : 0;
  const deptSeasons = dept ? (dept.seasons || ['Spring', 'Summer', 'Fall']) : ['Spring', 'Summer', 'Fall'];

  // summary block is already folded into totalEarned by recalc()
  const summaryBlock = state.semesters.find(s => s.summary);

  const gradedSemesters = state.semesters.filter(sem =>
    !sem.running && !sem.summary && sem.courses.some(c =>
      c.name.trim() && c.grade && GRADES[c.grade] !== undefined
    )
  );

  // show tracker if we have a summary block OR real graded semesters
  if ((!gradedSemesters.length && !summaryBlock) || !totalRequired) {
    box.style.display = 'none';
    return;
  }

  box.style.display = '';

  const semData = [];

  state.semesters.forEach(sem => {
    if (sem.summary) return;   // handled separately as a special node

    let hasCourses = false;
    sem.courses.forEach(c => {
      if (c.name.trim()) hasCourses = true;
    });
    if (!hasCourses) return;

    const gpa = calcSemGPA(sem);
    const semLabel = sem.name
      ? sem.name.replace(/<[^>]+>/g, '').replace(/\s*\(.*\)$/, '')
      : 'Semester';

    const creditsThisSem = sem.courses.reduce((sum, c) => {
      if (!c.name.trim() || !c.credits) return sum;
      if (sem.running) return sum + c.credits;
      if (!c.grade || c.grade === 'P' || c.grade === 'I' || c.grade === 'F(NT)') return sum;
      const gp = GRADES[c.grade];
      if (gp === undefined || gp <= 0) return sum;
      return sum + c.credits;
    }, 0);

    semData.push({
      id: sem.id,
      label: semLabel,
      gpa,
      credits: creditsThisSem,
      running: !!sem.running,
      courseCount: sem.courses.filter(c => c.name.trim()).length,
    });
  });

  if (!semData.length && !summaryBlock) {
    box.style.display = 'none';
    return;
  }

  const completedSems = semData.filter(s => !s.running);
  const runningSem = semData.find(s => s.running);
  const creditsRemaining = Math.max(0, totalRequired - totalEarned);

  // ── Calculate how many dept semesters have elapsed from start to now ────
  const startSeason = getStartSeason();
  const startYearNum = parseInt(getStartYear());
  let estimatedSummarySems = 0;
  if (summaryBlock && startSeason && startYearNum) {
    const now = new Date();
    const month = now.getMonth() + 1;
    let curSeason;
    if (month <= 4) curSeason = 'Spring';
    else if (month <= 8) curSeason = 'Summer';
    else curSeason = 'Fall';
    const curYear = now.getFullYear();

    // Count dept semesters from start up to (but not including) current
    let si = deptSeasons.indexOf(startSeason);
    if (si === -1) si = 0;
    let yr = startYearNum;
    let count = 0;
    while (!(deptSeasons[si] === curSeason && yr === curYear)) {
      count++;
      si++;
      if (si >= deptSeasons.length) { si = 0; yr++; }
      if (count > 50) break; // safety
    }
    // Subtract any real (non-summary) completed semesters already tracked
    estimatedSummarySems = Math.max(0, count - completedSems.length);
  }

  // Total completed semester count includes estimated summary semesters
  const totalCompletedCount = completedSems.length + estimatedSummarySems;

  // Calculate pace from all available data
  const DEFAULT_PACE = 12;
  const totalCompletedCredits = completedSems.reduce((s, d) => s + d.credits, 0)
    + (summaryBlock ? summaryBlock.summaryCredits : 0);
  const avgCredits = totalCompletedCount > 0
    ? totalCompletedCredits / totalCompletedCount
    : DEFAULT_PACE;

  const semsRemaining = avgCredits > 0 ? Math.ceil(creditsRemaining / avgCredits) : 0;

  let gradEstimate = '—';
  if (startSeason && startYearNum) {
    const totalSemsNeeded = totalCompletedCount + (runningSem ? 1 : 0) + semsRemaining;
    let si = deptSeasons.indexOf(startSeason);
    if (si === -1) si = 0;
    let yr = startYearNum;
    for (let i = 0; i < totalSemsNeeded - 1; i++) {
      si++;
      if (si >= deptSeasons.length) { si = 0; yr++; }
    }
    gradEstimate = `${deptSeasons[si]} '${String(yr).slice(2)}`;
  }

  const progressPct = Math.min((totalEarned / totalRequired) * 100, 100);

  const fmtCr = n => n % 1 === 0 ? String(n) : n.toFixed(1);
  const earnedDisplay = fmtCr(totalEarned);
  const remainingDisplay = fmtCr(creditsRemaining);
  const statsHtml = `
    <div class="tracker-stats">
      <div class="tracker-stat">
        <div class="tracker-stat-val">${earnedDisplay}<span class="tracker-stat-dim"> / ${totalRequired}</span></div>
        <div class="tracker-stat-label">Credits Earned</div>
      </div>
      <div class="tracker-stat">
        <div class="tracker-stat-val">${totalCompletedCount}</div>
        <div class="tracker-stat-label">Semesters Done</div>
      </div>
      <div class="tracker-stat">
        <div class="tracker-stat-val">${fmtCr(avgCredits)}<span class="tracker-stat-dim"> cr/sem</span></div>
        <div class="tracker-stat-label">Your Pace</div>
      </div>
      <div class="tracker-stat">
        <div class="tracker-stat-val">${escHtml(gradEstimate)}</div>
        <div class="tracker-stat-label">Est. Graduation</div>
      </div>
    </div>`;

  const barHtml = `
    <div class="tracker-bar-wrap">
      <div class="tracker-bar-bg">
        <div class="tracker-bar-fill" style="width:${progressPct.toFixed(1)}%"></div>
      </div>
      <div class="tracker-bar-labels">
        <span>${progressPct.toFixed(0)}% complete</span>
        <span>${remainingDisplay} credits remaining</span>
      </div>
    </div>`;

  const gpaColor = gpa => {
    if (gpa === null) return 'var(--text3)';
    if (gpa >= 3.5) return '#2ECC71';
    if (gpa >= 3.0) return '#27ae60';
    if (gpa >= 2.5) return '#F0A500';
    return '#e74c3c';
  };

  const gpaClass = gpa => {
    if (gpa === null) return '';
    if (gpa >= 3.5) return 'gpa-excellent';
    if (gpa >= 3.0) return 'gpa-good';
    if (gpa >= 2.5) return 'gpa-warning';
    return 'gpa-danger';
  };

  // Build summary node if present
  const summaryNodeHtml = summaryBlock ? `
    <div class="tracker-node completed">
      <div class="tracker-node-dot">
        <div class="tracker-node-dot-inner"></div>
      </div>
      <div class="tracker-node-card">
        <div class="tracker-node-label">Past Semesters</div>
        <div class="tracker-node-gpa" style="color:#2ECC71">${summaryBlock.summaryCGPA.toFixed(2)}</div>
        <div class="tracker-node-meta">${fmtCr(summaryBlock.summaryCredits)} cr</div>
      </div>
    </div>` : '';

  const nodes = semData.map((s, idx) => {
    const gpaText = s.gpa !== null ? s.gpa.toFixed(2) : '—';
    const nodeClass = s.running ? 'tracker-node running' : `tracker-node completed ${gpaClass(s.gpa)}`;
    return `
      <div class="${nodeClass}">
        <div class="tracker-node-dot">
          <div class="tracker-node-dot-inner"></div>
        </div>
        <div class="tracker-node-card">
          <div class="tracker-node-label">${escHtml(s.label)}</div>
          <div class="tracker-node-gpa" style="color:${s.running ? '#F0A500' : gpaColor(s.gpa)}">
            ${s.running ? 'In Progress' : gpaText}
          </div>
          <div class="tracker-node-meta">${s.credits} cr · ${s.courseCount} courses</div>
        </div>
      </div>`;
  }).join('');

  // ── Build projected semester nodes with real season/year names ──────────
  let projectedHtml = '';
  if (semsRemaining > 0) {
    const maxShow = Math.min(semsRemaining, 4);
    const remaining = semsRemaining - maxShow;

    // Determine the starting point for projected semesters
    // Use the last real semester's season/year, or summary block context
    let lastLabel = semData.length > 0
      ? semData[semData.length - 1].label
      : (summaryBlock ? 'Past Semesters' : '');
    let nextSi = -1;
    let nextYr = 0;
    const seasonMatch = lastLabel.match(/(Spring|Summer|Fall)\s*'?(\d{2,4})/);
    if (seasonMatch) {
      nextYr = seasonMatch[2].length === 2 ? 2000 + parseInt(seasonMatch[2]) : parseInt(seasonMatch[2]);
      const matchedIdx = deptSeasons.indexOf(seasonMatch[1]);
      if (matchedIdx === -1) {
        nextSi = 0;
        nextYr++;
      } else {
        nextSi = matchedIdx + 1;
        if (nextSi >= deptSeasons.length) { nextSi = 0; nextYr++; }
      }
    } else if (summaryBlock && startSeason && startYearNum) {
      // No real semesters yet — project from current real-world semester
      const now = new Date();
      const month = now.getMonth() + 1;
      let curSeason;
      if (month <= 4) curSeason = 'Spring';
      else if (month <= 8) curSeason = 'Summer';
      else curSeason = 'Fall';
      const curYear = now.getFullYear();

      // Find the current or next dept season
      let season = curSeason;
      if (!deptSeasons.includes(season)) {
        const seasonOrder = ['Spring', 'Summer', 'Fall'];
        const curIdx = seasonOrder.indexOf(season);
        for (let offset = 1; offset <= 3; offset++) {
          const candidate = seasonOrder[(curIdx + offset) % 3];
          if (deptSeasons.includes(candidate)) { season = candidate; break; }
        }
      }
      nextSi = deptSeasons.indexOf(season);
      nextYr = curYear;
    }

    for (let j = 0; j < maxShow; j++) {
      let projLabel = `Semester ${totalCompletedCount + (runningSem ? 1 : 0) + j + 1}`;
      if (nextSi >= 0) {
        projLabel = `${deptSeasons[nextSi]} '${String(nextYr).slice(2)}`;
        nextSi++;
        if (nextSi >= deptSeasons.length) { nextSi = 0; nextYr++; }
      }
      projectedHtml += `
        <div class="tracker-node projected">
          <div class="tracker-node-dot">
            <div class="tracker-node-dot-inner"></div>
          </div>
          <div class="tracker-node-card">
            <div class="tracker-node-label">${escHtml(projLabel)}</div>
            <div class="tracker-node-gpa" style="color:var(--text3)">approx. ${fmtCr(avgCredits)} cr</div>
          </div>
        </div>`;
    }

    if (remaining > 0) {
      projectedHtml += `
        <div class="tracker-node projected more">
          <div class="tracker-node-dot">
            <div class="tracker-node-dot-inner"></div>
          </div>
          <div class="tracker-node-card">
            <div class="tracker-node-label">+${remaining} more</div>
          </div>
        </div>`;
    }

    projectedHtml += `
      <div class="tracker-node graduation">
        <div class="tracker-node-dot">
          <div class="tracker-node-dot-inner">🎓</div>
        </div>
        <div class="tracker-node-card">
          <div class="tracker-node-label">Graduation</div>
          <div class="tracker-node-gpa" style="color:#2ECC71">${escHtml(gradEstimate)}</div>
        </div>
      </div>`;
  } else if (creditsRemaining <= 0) {
    projectedHtml = `
      <div class="tracker-node graduation completed">
        <div class="tracker-node-dot">
          <div class="tracker-node-dot-inner">🎓</div>
        </div>
        <div class="tracker-node-card">
          <div class="tracker-node-label">Graduation</div>
          <div class="tracker-node-gpa" style="color:#2ECC71">Complete!</div>
        </div>
      </div>`;
  }

  const timelineHtml = `
    <div class="tracker-timeline-wrap">
      <div class="tracker-timeline">
        <div class="tracker-timeline-line"></div>
        ${summaryNodeHtml}
        ${nodes}
        ${projectedHtml}
      </div>
    </div>`;

  const content = document.getElementById('degreeTrackerContent');
  content.innerHTML = statsHtml + barHtml + timelineHtml;
}
