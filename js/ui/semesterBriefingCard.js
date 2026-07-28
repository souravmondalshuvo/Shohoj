// js/ui/semesterBriefingCard.js
// "This semester" block for the dedicated /profile/ page (#476).
//
// The rest of the Profile page restates the calculator and the tracker. This
// block is the part only the Profile page can show: the student's own routine
// picks joined against the live section feed, which yields three things no
// single tab can answer — when their exams actually bunch up, what their week
// really costs them, and where to sit out the gaps.
//
// View layer only. Every measurement lives in js/core/semesterBriefing.js so
// the React shell can reuse it; this file turns those numbers into HTML and
// writes the plain-language verdict that goes above each visual.
//
// Names are prefixed `sbc`/`SBC` because build3.py flattens every module into
// one scope (see scripts/check_bundle_collisions.py).

import { escHtml } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';
import {
  buildExamBriefing,
  buildWeekSummary,
  formatClock,
  formatDuration,
  parseRoomFloor,
  suggestGapRooms,
  BRIEFING_WEEK_ORDER,
  NOTABLE_FLOOR_DELTA,
} from '../core/semesterBriefing.js';

// Weeks in a BRACU semester — turns a recurring gap into the number that makes
// it feel real ("4h 40m every Saturday" → "65 hours this semester").
const SBC_SEMESTER_WEEKS = 13;

// Grid bounds for the week strip. Slots outside are clamped, not dropped.
const SBC_GRID_START_MIN = 8 * 60;
const SBC_GRID_END_MIN = 19 * 60;

const SBC_DAY_LABELS = {
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};

// Friday is off; a student with no Friday class shouldn't see a dead column.
const SBC_GRID_DAYS = BRIEFING_WEEK_ORDER.filter(d => d !== 'FRIDAY');

// ── Formatting helpers ────────────────────────────────────────────────────────

/** `"2026-07-27"` → `"Mon 27 Jul"`. Parsed as UTC so the label can't shift a day. */
export function sbcFormatExamDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return String(iso || '');
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (Number.isNaN(date.getTime())) return String(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

/** Whole hours read better than `19.5h` in a chip; halves are kept when present. */
export function sbcFormatHours(hours) {
  if (!Number.isFinite(hours)) return '—';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

/** A gap this tight between exams is the thing worth shouting about. */
function sbcGapTone(hours) {
  if (!Number.isFinite(hours)) return '';
  if (hours < 6) return 'hot';
  if (hours < 20) return 'warn';
  return '';
}

// ── Exam crunch ───────────────────────────────────────────────────────────────

/**
 * The sentence a student actually reads. Everything else in the card is
 * evidence for it, so it has to be true of *their* data, not a template with
 * numbers dropped in — a comfortable exam spread must read as comfortable.
 */
export function sbcExamVerdict(brief) {
  if (!brief || !Array.isArray(brief.exams) || brief.exams.length === 0) return '';
  const n = brief.exams.length;
  if (n === 1) {
    return `One exam this round — <b>${escHtml(brief.exams[0].courseCode)}</b> on ${escHtml(sbcFormatExamDate(brief.exams[0].date))}.`;
  }

  const sameDay = brief.exams.filter(e => e.sameDayAsPrev);
  const span = sbcFormatHours(brief.spanHours);

  if (brief.spanHours <= 72) {
    const tail = sameDay.length > 0
      ? ` — and <em>${escHtml(sameDay[0].courseCode)} shares a day with the exam before it</em>`
      : '';
    return `All ${n} exams fall inside <span class="hot">${escHtml(span)}</span>${tail}.`;
  }
  if (sameDay.length > 0) {
    return `${n} exams across ${escHtml(span)}, with <em>${sameDay.length} landing on a day that already has one</em>.`;
  }
  if (Number.isFinite(brief.tightestGapHours) && brief.tightestGapHours < 24) {
    return `${n} exams across ${escHtml(span)}; your tightest turnaround is <em>${escHtml(sbcFormatHours(brief.tightestGapHours))}</em>.`;
  }
  return `${n} exams across ${escHtml(span)}, with at least a day between each. <b>That's a kind spread.</b>`;
}

export function sbcExamCardHtml(brief, kind = 'mid') {
  const isMid = kind === 'mid';
  const toggle = `
        <div class="pfb-toggle" role="group" aria-label="Exam period">
          <button class="pfb-seg ${isMid ? 'is-on' : ''}" data-action="briefing:examKind" data-kind="mid"
                  aria-pressed="${isMid ? 'true' : 'false'}">Midterms</button>
          <button class="pfb-seg ${isMid ? '' : 'is-on'}" data-action="briefing:examKind" data-kind="final"
                  aria-pressed="${isMid ? 'false' : 'true'}">Finals</button>
        </div>`;

  if (!brief) {
    return `
      <section class="pfb-card">
        <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">📕</span> Exam crunch</h3>${toggle}</div>
        <div class="pfb-empty">No ${isMid ? 'midterm' : 'final'} dates published for your sections yet. They appear here as soon as the feed carries them.</div>
      </section>`;
  }

  const rows = brief.exams.map(exam => {
    const tone = exam.sameDayAsPrev ? 'hot' : sbcGapTone(exam.gapHoursFromPrev);
    const chip = exam.gapHoursFromPrev === null
      ? '<span class="pfb-chip cool">first up</span>'
      : exam.sameDayAsPrev
        ? `<span class="pfb-chip hot">same day · ${escHtml(sbcFormatHours(exam.gapHoursFromPrev))} later</span>`
        : `<span class="pfb-chip ${tone}">${escHtml(sbcFormatHours(exam.gapHoursFromPrev))} gap</span>`;
    return `
        <li class="pfb-row">
          <span class="pfb-row-dot ${tone === 'hot' ? 'hot' : ''}" aria-hidden="true"></span>
          <span class="pfb-row-code">${escHtml(exam.courseCode)}</span>
          <span class="pfb-row-when"><b>${escHtml(sbcFormatExamDate(exam.date))}</b> · ${escHtml(formatClock(exam.startMin))}–${escHtml(formatClock(exam.endMin))}</span>
          ${chip}
          <span class="pfb-row-meta">${escHtml(exam.facultyInitials || '')}</span>
        </li>`;
  }).join('');

  const missing = brief.missing.length > 0
    ? `<div class="pfb-note">No date yet for ${escHtml(brief.missing.join(', '))}.</div>`
    : '';

  return `
      <section class="pfb-card">
        <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">📕</span> Exam crunch</h3>${toggle}</div>
        <p class="pfb-verdict">${sbcExamVerdict(brief)}</p>
        <ul class="pfb-rows">${rows}</ul>
        ${missing}
        <div class="pfb-note">Dates come from the sections you picked on the Routine tab — read from the public feed, nothing uploaded.</div>
      </section>`;
}

// ── Week on campus ────────────────────────────────────────────────────────────

export function sbcWeekVerdict(week) {
  if (!week || week.campusDays === 0) return '';
  const contact = formatDuration(week.contactMinutes);
  const dead = formatDuration(week.deadGapMinutes);
  if (week.deadGapMinutes === 0) {
    return `<b>${week.campusDays} day${week.campusDays === 1 ? '' : 's'}</b> on campus for ${escHtml(contact)} of class, back to back. <b>No waiting around.</b>`;
  }
  return `You're on campus <b>${week.campusDays} day${week.campusDays === 1 ? '' : 's'}</b> for ${escHtml(contact)} of class — and <em>${escHtml(dead)} of waiting</em>.`;
}

/** Percent offsets for a slot inside the 08:00–19:00 grid, clamped to it. */
function sbcGridBand(startMin, endMin) {
  const span = SBC_GRID_END_MIN - SBC_GRID_START_MIN;
  const from = Math.max(SBC_GRID_START_MIN, Math.min(startMin, SBC_GRID_END_MIN));
  const to = Math.max(from, Math.min(endMin, SBC_GRID_END_MIN));
  return {
    top: ((from - SBC_GRID_START_MIN) / span) * 100,
    height: Math.max(2, ((to - from) / span) * 100),
  };
}

export function sbcWeekCardHtml(week) {
  if (!week || week.campusDays === 0) {
    return `
      <section class="pfb-card">
        <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🗓️</span> Your week on campus</h3></div>
        <div class="pfb-empty">Pick your sections on the <strong>Routine</strong> tab and your week shows up here.</div>
      </section>`;
  }

  const stats = [
    ['', formatDuration(week.contactMinutes), 'Contact time'],
    [week.deadGapMinutes > 0 ? 'alert' : '', formatDuration(week.deadGapMinutes), 'Dead time'],
    ['', `${week.campusDays} / ${SBC_GRID_DAYS.length}`, 'Campus days'],
    ['', week.earliestStartMin === null ? '—' : formatClock(week.earliestStartMin), 'Earliest start'],
    [week.longestDayMinutes >= 6 * 60 ? 'alert' : '', formatDuration(week.longestDayMinutes), 'Longest day'],
  ].map(([tone, value, label]) => `
        <div class="pfb-stat ${tone}">
          <div class="pfb-stat-n">${escHtml(String(value))}</div>
          <span class="pfb-stat-l">${escHtml(label)}</span>
        </div>`).join('');

  const columns = SBC_GRID_DAYS.map(day => {
    const slots = week.byDay.get(day) || [];
    if (slots.length === 0) return '<div class="pfb-col is-off"></div>';
    const blocks = slots.map(slot => {
      const band = sbcGridBand(slot.startMin, slot.endMin);
      return `
          <div class="pfb-blk ${slot.kind === 'lab' ? 'is-lab' : ''}"
               style="top:${band.top.toFixed(2)}%;height:${band.height.toFixed(2)}%"
               title="${escHtml(slot.courseCode)} ${escHtml(slot.kind)} · ${escHtml(formatClock(slot.startMin))}–${escHtml(formatClock(slot.endMin))} · ${escHtml(slot.room)}">
            <span class="pfb-blk-code">${escHtml(slot.courseCode)}${slot.kind === 'lab' ? ' lab' : ''}</span>
            <span class="pfb-blk-room">${escHtml(slot.room)}</span>
          </div>`;
    }).join('');
    const gapBands = (week.gaps.filter(g => g.day === day)).map(gap => {
      const band = sbcGridBand(gap.startMin, gap.endMin);
      return `
          <div class="pfb-gap" style="top:${band.top.toFixed(2)}%;height:${band.height.toFixed(2)}%" aria-hidden="true">
            <span>${escHtml(formatDuration(gap.minutes))}</span>
          </div>`;
    }).join('');
    return `<div class="pfb-col">${gapBands}${blocks}</div>`;
  }).join('');

  const headers = SBC_GRID_DAYS
    .map(day => `<div class="pfb-week-h">${escHtml(SBC_DAY_LABELS[day] || day)}</div>`)
    .join('');

  // Only the hops worth acting on: a couple of floors is a jog, one floor isn't.
  const notableHops = week.hops.filter(
    h => h.floorDelta === null || Math.abs(h.floorDelta) >= NOTABLE_FLOOR_DELTA,
  );
  const hopsBlock = notableHops.length === 0 ? '' : `
        <div class="pfb-subhead">
          <span>⚠️ Tight transitions</span>
          <span class="pfb-chip warn">${notableHops.length} this week</span>
        </div>
        <div class="pfb-hops">${notableHops.map(hop => {
          const floors = hop.floorDelta === null
            ? ''
            : ` · <b>${Math.abs(hop.floorDelta)} floor${Math.abs(hop.floorDelta) === 1 ? '' : 's'} ${hop.floorDelta > 0 ? 'up' : 'down'}</b>`;
          return `
          <div class="pfb-hop">
            <b>${escHtml(SBC_DAY_LABELS[hop.day] || hop.day)}</b>
            <span>${escHtml(hop.fromCourse)} <span class="pfb-arrow">→</span> ${escHtml(hop.toCourse)}</span>
            <span class="pfb-hop-rooms">${escHtml(hop.fromRoom)} → ${escHtml(hop.toRoom)}${floors}</span>
            <span class="pfb-hop-min">${escHtml(formatDuration(hop.minutes))}</span>
          </div>`;
        }).join('')}</div>`;

  return `
      <section class="pfb-card">
        <div class="pfb-head">
          <h3 class="pfb-title"><span class="pfb-ico">🗓️</span> Your week on campus</h3>
          <span class="pfb-chip">${week.campusDays} day${week.campusDays === 1 ? '' : 's'} on campus</span>
        </div>
        <p class="pfb-verdict">${sbcWeekVerdict(week)}</p>
        <div class="pfb-stats">${stats}</div>
        <div class="pfb-week">
          <div></div>${headers}
          <div class="pfb-week-times">
            <span style="top:0%">08:00</span><span style="top:27.3%">11:00</span>
            <span style="top:54.5%">14:00</span><span style="top:81.8%">17:00</span>
          </div>
          ${columns}
        </div>
        ${hopsBlock}
      </section>`;
}

// ── Where to wait ─────────────────────────────────────────────────────────────

export function sbcGapsVerdict(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) return '';
  const longest = gaps.reduce((max, g) => (g.minutes > max.minutes ? g : max), gaps[0]);
  const term = Math.round((longest.minutes * SBC_SEMESTER_WEEKS) / 60);
  return `${escHtml(SBC_DAY_LABELS[longest.day] || longest.day)}'s <em>${escHtml(formatDuration(longest.minutes))} gap</em> repeats every week — that's <b>${term} hours</b> across the semester.`;
}

export function sbcGapRoomsCardHtml(gaps, suggestionsByIndex) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return `
      <section class="pfb-card">
        <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🚪</span> Where to wait</h3></div>
        <div class="pfb-empty">No long gaps in your week — your classes run back to back.</div>
      </section>`;
  }

  const slots = gaps.map((gap, i) => {
    const picks = (suggestionsByIndex && suggestionsByIndex[i]) || { sameFloor: [], elsewhere: [], total: 0 };
    const floor = gap.nextFloor;
    const rooms = [
      ...picks.sameFloor.map(r => `<span class="pfb-room is-best">${escHtml(r)}<small>same floor</small></span>`),
      ...picks.elsewhere.map(r => `<span class="pfb-room">${escHtml(r)}</span>`),
    ];
    const shown = picks.sameFloor.length + picks.elsewhere.length;
    if (picks.total > shown) rooms.push(`<span class="pfb-room is-more">+${picks.total - shown} more</span>`);

    const why = picks.total === 0
      ? `Nothing is free for the whole gap — the Free Rooms tab can find a room for part of it.`
      : floor === null
        ? `${picks.total} room${picks.total === 1 ? '' : 's'} free for the whole gap.`
        : `${picks.total} room${picks.total === 1 ? '' : 's'} free right through it${picks.sameFloor.length > 0 ? `, and these sit on floor ${floor} — where <b>${escHtml(gap.beforeCourse)}</b> starts` : ''}.`;

    return `
        <div class="pfb-slot">
          <div class="pfb-slot-head">
            <span class="pfb-slot-when">${escHtml(SBC_DAY_LABELS[gap.day] || gap.day)} · ${escHtml(formatClock(gap.startMin))} → ${escHtml(formatClock(gap.endMin))}</span>
            <span class="pfb-chip ${gap.minutes >= 180 ? 'warn' : ''}">${escHtml(formatDuration(gap.minutes))}</span>
          </div>
          <div class="pfb-slot-why">After ${escHtml(gap.afterCourse)}, before ${escHtml(gap.beforeCourse)} in <b>${escHtml(gap.nextRoom)}</b>. ${why}</div>
          ${rooms.length > 0 ? `<div class="pfb-rooms">${rooms.join('')}</div>` : ''}
        </div>`;
  }).join('');

  return `
      <section class="pfb-card">
        <div class="pfb-head">
          <h3 class="pfb-title"><span class="pfb-ico">🚪</span> Where to wait</h3>
          <span class="pfb-chip">${gaps.length} recurring gap${gaps.length === 1 ? '' : 's'}</span>
        </div>
        <p class="pfb-verdict">${sbcGapsVerdict(gaps)}</p>
        <div class="pfb-slots">${slots}</div>
        <div class="pfb-note">Availability is computed from the same feed the Free Rooms tab uses — pointed at your gaps instead of the whole campus.</div>
      </section>`;
}

// ── Block assembly ────────────────────────────────────────────────────────────

export function sbcLoadingHtml() {
  return `
    <div class="pfb-zone"><h2>This semester</h2></div>
    <section class="pfb-card">
      <div class="pfb-skel" style="width:38%"></div>
      <div class="pfb-skel" style="width:82%"></div>
      <div class="pfb-skel" style="width:64%"></div>
    </section>`;
}

export function sbcUnavailableHtml() {
  return `
    <div class="pfb-zone"><h2>This semester</h2></div>
    <section class="pfb-card">
      <div class="pfb-empty">Couldn't reach the section feed. Your exam dates, week and gaps appear here once it's back.</div>
    </section>`;
}

export function sbcNoRoutineHtml() {
  return `
    <div class="pfb-zone"><h2>This semester</h2></div>
    <section class="pfb-card">
      <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🗓️</span> This semester</h3></div>
      <div class="pfb-empty">Pick your sections on the <strong>Routine</strong> tab and this page will show when your exams bunch up, what your week costs you, and where to wait out the gaps.</div>
      <a class="pfb-cta" href="../#routine">Build your routine</a>
    </section>`;
}

/**
 * The whole block. `sections` are the student's picked sections; `busyIndex`
 * is the campus-wide room index (all sections, not just theirs) so gap rooms
 * can be suggested. Pure — the caller does the fetching.
 */
export function sbcBriefingHtml(sections, busyIndex, kind = 'mid') {
  const picked = Array.isArray(sections) ? sections : [];
  if (picked.length === 0) return sbcNoRoutineHtml();

  const week = buildWeekSummary(picked);
  const brief = buildExamBriefing(picked, kind);
  const suggestions = busyIndex
    ? week.gaps.map(gap => suggestGapRooms(busyIndex, gap))
    : week.gaps.map(() => ({ sameFloor: [], elsewhere: [], total: 0 }));

  return `
    <div class="pfb-zone">
      <h2>This semester</h2>
      <span class="pfb-zone-sub">${picked.length} course${picked.length === 1 ? '' : 's'} · from your saved routine</span>
    </div>
    ${sbcExamCardHtml(brief, kind)}
    ${sbcWeekCardHtml(week)}
    ${sbcGapRoomsCardHtml(week.gaps, suggestions)}`;
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

// Held so the Midterms/Finals switch can repaint without re-fetching the feed.
let _sbcState = { hostId: null, sections: [], busyIndex: null, kind: 'mid' };

export function renderSemesterBriefing(hostId, sections, busyIndex, kind) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById(hostId);
  if (!host) return;
  _sbcState = {
    hostId,
    sections: Array.isArray(sections) ? sections : [],
    busyIndex: busyIndex || null,
    kind: kind === 'final' ? 'final' : 'mid',
  };
  // Every interpolation above goes through escHtml.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  host.innerHTML = sbcBriefingHtml(_sbcState.sections, _sbcState.busyIndex, _sbcState.kind);
}

/** Paint a non-data state (loading / feed down) into the same host. */
export function renderSemesterBriefingState(hostId, html) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById(hostId);
  if (!host) return;
  // Static markup from this module, no interpolation.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  host.innerHTML = html;
}

// Midterms ⇄ Finals. Wired through dispatch because the production CSP blocks
// inline handlers (script-src-attr), so an onclick here would silently die.
registerAction('briefing:examKind', el => {
  const kind = el && el.dataset ? el.dataset.kind : null;
  if (kind !== 'mid' && kind !== 'final') return;
  if (!_sbcState.hostId || kind === _sbcState.kind) return;
  renderSemesterBriefing(_sbcState.hostId, _sbcState.sections, _sbcState.busyIndex, kind);
});

// Exported for the room-floor label in tests and for callers that want to show
// a floor next to a room without importing the core module directly.
export { parseRoomFloor };
