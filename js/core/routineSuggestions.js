// Twin of src/core/routineSuggestions.ts — hand-maintained, not generated.
// src/core/routineSuggestions.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Auto-suggest engine: enumerate one-section-per-picked-course combinations,
// drop class-clashing combos, rank survivors by faculty rating + seat slack +
// exam-clash penalty, return top K. Pure / I/O-free.

import { hasClassClash, hasExamClash } from './connectFeed.js';
import { ratingTier } from './routineFaculty.js';

const DEFAULTS = {
    maxCombinations: 5_000,
    topK: 5,
    skipAboveFillRatio: 1.0,
    examClashPenalty: 25,
    excellentBonus: 4,
    goodBonus: 2,
    badPenalty: 4,
    warnPenalty: 2,
    seatSlackWeight: 2,
    gapWeight: 0,
    sectionFilter: () => true,
};

function fillRatio(s) {
    if (!s || s.capacity <= 0) return 0;
    return s.consumedSeat / s.capacity;
}

// Total idle minutes between consecutive classes on the same day, summed over
// the week. Slots are grouped per day and sorted; only positive gaps count, so
// overlaps (which clash-filtering removes anyway) never produce negative time.
function totalGapMinutes(row) {
    const byDay = new Map();
    for (const s of row) {
        for (const slot of s.classSlots) {
            const arr = byDay.get(slot.day);
            if (arr) arr.push(slot);
            else byDay.set(slot.day, [slot]);
        }
    }
    let total = 0;
    for (const slots of byDay.values()) {
        slots.sort((a, b) => a.startMin - b.startMin);
        for (let i = 1; i < slots.length; i++) {
            const gap = slots[i].startMin - slots[i - 1].endMin;
            if (gap > 0) total += gap;
        }
    }
    return total;
}

function filterUsableSections(sections, maxFill, sectionFilter) {
    return sections.filter(s => fillRatio(s) < maxFill && sectionFilter(s));
}

function enumerate(perCourse, cap) {
    if (perCourse.length === 0) return { combos: [], truncated: false };
    if (perCourse.some(list => list.length === 0)) return { combos: [], truncated: false };
    const combos = [];
    const idx = new Array(perCourse.length).fill(0);
    let truncated = false;
    while (true) {
        const row = perCourse.map((list, i) => list[idx[i]]);
        combos.push(row);
        if (combos.length >= cap) { truncated = true; break; }
        let i = perCourse.length - 1;
        while (i >= 0) {
            idx[i] += 1;
            if (idx[i] < perCourse[i].length) break;
            idx[i] = 0;
            i -= 1;
        }
        if (i < 0) break;
    }
    return { combos, truncated };
}

function anyClassClash(row) {
    for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
            if (hasClassClash(row[i], row[j])) return true;
        }
    }
    return false;
}

function countExamClashPairs(row) {
    let n = 0;
    for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
            if (hasExamClash(row[i], row[j])) n += 1;
        }
    }
    return n;
}

function ratingFor(section, ratingMap) {
    const key = (section.facultyInitials || '').toUpperCase();
    if (!key) return null;
    return ratingMap.get(key) ?? null;
}

export function scoreCombination(row, ratingMap, options = {}) {
    const opts = { ...DEFAULTS, ...options };

    let ratingSum = 0;
    let ratingDenom = 0;
    let excellentCount = 0, goodCount = 0, midCount = 0;
    let warnCount = 0, badCount = 0, unratedCount = 0;
    let ratingScore = 0;

    for (const s of row) {
        const r = ratingFor(s, ratingMap);
        if (!r || r.overall === null) { unratedCount += 1; continue; }
        ratingSum += r.overall;
        ratingDenom += 1;
        const tier = r.tier === 'low-sample' ? ratingTier(r.overall, 99) : r.tier;
        if (tier === 'excellent') { excellentCount += 1; ratingScore += opts.excellentBonus; }
        else if (tier === 'good') { goodCount += 1; ratingScore += opts.goodBonus; }
        else if (tier === 'mid')  { midCount += 1; }
        else if (tier === 'warn') { warnCount += 1; ratingScore -= opts.warnPenalty; }
        else if (tier === 'bad')  { badCount += 1; ratingScore -= opts.badPenalty; }
    }

    let seatScore = 0;
    let fullCount = 0, tightCount = 0;
    for (const s of row) {
        const fr = fillRatio(s);
        if (fr >= 1.0) fullCount += 1;
        else if (fr > 0.85) tightCount += 1;
        seatScore += (1 - Math.min(1, fr)) * opts.seatSlackWeight;
    }

    const examPairs = countExamClashPairs(row);
    const examClashPenalty = examPairs * opts.examClashPenalty;

    const gapMinutes = totalGapMinutes(row);
    const gapPenalty = (gapMinutes / 60) * opts.gapWeight;

    const score = ratingScore + seatScore - examClashPenalty - gapPenalty;

    return {
        sections: row,
        score,
        breakdown: {
            ratingScore, seatScore, examClashPenalty,
            gapMinutes, gapPenalty,
            avgRating: ratingDenom > 0 ? ratingSum / ratingDenom : null,
            excellentCount, goodCount, midCount, warnCount, badCount, unratedCount,
            fullCount, tightCount,
            examClashPairs: examPairs,
        },
    };
}

export function suggestCombinations(courseCodes, index, ratingMap = new Map(), options = {}) {
    const opts = { ...DEFAULTS, ...options };

    const skippedCourses = [];
    const perCourse = [];
    for (const code of courseCodes) {
        const list = index.get(code) ?? [];
        const usable = filterUsableSections(list, opts.skipAboveFillRatio, opts.sectionFilter);
        if (usable.length === 0) skippedCourses.push(code);
        else perCourse.push(usable);
    }
    if (perCourse.length === 0) {
        return { suggestions: [], skippedCourses, truncated: false, enumerated: 0, feasible: 0 };
    }

    const { combos, truncated } = enumerate(perCourse, opts.maxCombinations);
    let feasible = 0;
    const scored = [];
    for (const row of combos) {
        if (anyClassClash(row)) continue;
        feasible += 1;
        scored.push(scoreCombination(row, ratingMap, opts));
    }
    scored.sort((a, b) => b.score - a.score);

    return {
        suggestions: scored.slice(0, opts.topK),
        skippedCourses,
        truncated,
        enumerated: combos.length,
        feasible,
    };
}
