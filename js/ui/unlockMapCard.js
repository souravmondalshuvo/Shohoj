// js/ui/unlockMapCard.js
//
// The "Next registration" zone on /profile/ (#478).
//
// A student picking next semester's courses has no way to know what they are
// eligible for — they cross-reference a transcript against a curriculum PDF by
// hand, or guess. The feed's prerequisite expressions joined against their own
// transcript answers it exactly.
//
// Rendering only: every eligibility decision is made by core/prereq.js. Reuses
// the briefing card's `pfb-*` classes so the two zones read as one page.

import { escHtml } from '../core/helpers.js';
import { buildUnlockMap, completedCodes } from '../core/prereq.js';
import { getCourseCode } from '../core/gpa-core.js';

/** How many rows a list shows before rolling the rest into a "+N more". */
const UMC_VISIBLE = 8;

function umcCourseRowHtml(candidate, note) {
  const name = candidate.name ? escHtml(candidate.name) : '';
  return `
      <li class="umc-row">
        <span class="umc-row-main">
          <strong>${escHtml(candidate.code)}</strong>${name ? ` <span class="umc-dim">${name}</span>` : ''}
        </span>
        <span class="umc-row-side">${note}</span>
      </li>`;
}

function umcListHtml(candidates, noteFor) {
  const shown = candidates.slice(0, UMC_VISIBLE);
  const more = candidates.length - shown.length;
  return `
      <ul class="umc-list">${shown.map(c => umcCourseRowHtml(c, noteFor(c))).join('')}</ul>
      ${more > 0 ? `<div class="umc-more">+${more} more</div>` : ''}`;
}

export function umcZoneHeadHtml() {
  return `<div class="pfb-zone"><h2>Next registration</h2></div>`;
}

export function umcLoadingHtml() {
  return `
    ${umcZoneHeadHtml()}
    <section class="pfb-card">
      <div class="pfb-skel" style="width:42%"></div>
      <div class="pfb-skel" style="width:76%"></div>
      <div class="pfb-skel" style="width:58%"></div>
    </section>`;
}

export function umcUnavailableHtml() {
  return `
    ${umcZoneHeadHtml()}
    <section class="pfb-card">
      <div class="pfb-empty">Couldn't reach the section feed. What you can register for next appears here once it's back.</div>
    </section>`;
}

export function umcNoTranscriptHtml() {
  return `
    ${umcZoneHeadHtml()}
    <section class="pfb-card">
      <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🔓</span> Next registration</h3></div>
      <div class="pfb-empty">Import your grade sheet and this page will work out exactly what you are eligible for next semester — and which courses are one step away.</div>
      <a class="pfb-cta" href="../#calculator">Import your transcript</a>
    </section>`;
}

export function umcNoPrereqDataHtml() {
  return `
    ${umcZoneHeadHtml()}
    <section class="pfb-card">
      <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🔓</span> Next registration</h3></div>
      <div class="pfb-empty">The section feed isn't publishing prerequisites this semester, so eligibility can't be checked. Nothing is wrong with your data.</div>
    </section>`;
}

/**
 * The zone itself. `map` is a buildUnlockMap result; nothing here decides
 * eligibility, it only chooses words.
 */
export function umcZoneHtml(map) {
  const leverage = map.highestLeverage;

  const unlockedCard = `
    <section class="pfb-card">
      <div class="pfb-head">
        <h3 class="pfb-title"><span class="pfb-ico">🔓</span> Unlocked now</h3>
        <span class="umc-count">${map.unlocked.length}</span>
      </div>
      ${
        map.unlocked.length === 0
          ? `<div class="pfb-empty">Nothing on offer this semester has its prerequisites met yet.</div>`
          : umcListHtml(map.unlocked, c =>
              c.unlockCount > 0
                ? `opens ${c.unlockCount} more`
                : `${c.credits ? `${c.credits} cr` : ''}`,
            )
      }
    </section>`;

  const oneAwayCard =
    map.oneAway.length === 0
      ? ''
      : `
    <section class="pfb-card">
      <div class="pfb-head">
        <h3 class="pfb-title"><span class="pfb-ico">🪜</span> One course away</h3>
        <span class="umc-count">${map.oneAway.length}</span>
      </div>
      <div class="umc-sub">Each of these opens as soon as you pass the course named beside it — and each of those is takeable now.</div>
      ${umcListHtml(map.oneAway, c => `needs <strong>${escHtml(c.missing[0])}</strong>`)}
    </section>`;

  const leverageCard = !leverage
    ? ''
    : `
    <section class="pfb-card umc-card-accent">
      <div class="pfb-head"><h3 class="pfb-title"><span class="pfb-ico">🗝️</span> Highest leverage</h3></div>
      <div class="umc-lead">
        <strong>${escHtml(leverage.code)}</strong>${leverage.name ? ` <span class="umc-dim">${escHtml(leverage.name)}</span>` : ''}
      </div>
      <div class="umc-sub">Passing it opens <strong>${leverage.unlockCount}</strong> further course${leverage.unlockCount === 1 ? '' : 's'} on offer this semester — more than anything else you can take right now.</div>
    </section>`;

  // Fail-open courses are shown, so the count has to be admitted rather than
  // quietly inflating "unlocked".
  const caveat =
    map.failedOpenCount > 0
      ? `<div class="pfb-note">${map.failedOpenCount} course${map.failedOpenCount === 1 ? "'s prerequisite" : "s' prerequisites"} couldn't be read and ${map.failedOpenCount === 1 ? 'is' : 'are'} listed as available — check with your advisor before registering.</div>`
      : '';

  return `
    ${umcZoneHeadHtml()}
    ${leverageCard}
    ${unlockedCard}
    ${oneAwayCard}
    ${caveat}`;
}

/**
 * Build the zone from a transcript snapshot and the feed's sections.
 *
 * Returns the HTML to paint. Kept separate from the DOM write so the decision
 * of *which* state to show is unit-testable.
 */
export function umcHtmlFor(snapshot, sections) {
  const semesters = Array.isArray(snapshot?.semesters) ? snapshot.semesters : [];
  const courses = semesters.flatMap(s => (Array.isArray(s.courses) ? s.courses : []));
  if (courses.length === 0) return umcNoTranscriptHtml();

  const completed = completedCodes(courses, getCourseCode);
  const map = buildUnlockMap(sections, completed);
  if (!map.hasPrereqData) return umcNoPrereqDataHtml();
  return umcZoneHtml(map);
}

/** Paint any of the above into a host element. */
export function renderUnlockMap(hostId, html) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById(hostId);
  if (!host) return;
  // Every interpolation above goes through escHtml.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  host.innerHTML = html;
}
