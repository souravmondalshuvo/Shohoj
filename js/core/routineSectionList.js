// Twin of src/core/routineSectionList.ts — hand-maintained, not generated.
// src/core/routineSectionList.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Ordering and filtering for a course's section list. Lifted out of
// js/ui/routineTab.js (#682) so the shell's Routine route can offer the same
// sort and filters rather than growing a second implementation of them.
// Pure / I/O-free: no store, no DOM.

/** "No early" hides anything starting before 9:00 AM. */
export const FILTER_EARLY_MIN = 9 * 60;
/** "No evening" hides anything ending after 5:00 PM. */
export const FILTER_EVENING_MIN = 17 * 60;

/** The sort modes the UI offers, in the order it offers them. */
export const SECTION_SORT_MODES = [
    ['section', 'Section #'],
    ['faculty', 'Faculty ★'],
    ['seats', 'Seats'],
    ['time', 'Earliest'],
];

export function seatsLeft(section) {
    return Math.max(0, (section.capacity || 0) - (section.consumedSeat || 0));
}

/** Start of the section's first class of the week; MAX_SAFE_INTEGER when it has none. */
export function earliestStart(section) {
    const slots = section.classSlots ?? [];
    if (slots.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...slots.map((s) => s.startMin));
}

/** Section number for ordering; unnumbered sections sort last. */
export function sectionNumber(name) {
    const n = parseInt(String(name ?? ''), 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Does this section survive the student's filters?
 *
 * A section with no class slots passes everything — the filters are claims
 * about when it meets, and there is nothing to judge.
 */
export function sectionPassesFilters(section, filters = {}) {
    const avoidDays = filters.avoidDays ?? [];
    if (!filters.noEarly && !filters.noEvening && avoidDays.length === 0) return true;
    for (const slot of section.classSlots ?? []) {
        if (filters.noEarly && slot.startMin < FILTER_EARLY_MIN) return false;
        if (filters.noEvening && slot.endMin > FILTER_EVENING_MIN) return false;
        if (avoidDays.includes(slot.day)) return false;
    }
    return true;
}

/**
 * Sort a course's sections by the active mode.
 *
 * Two rules outrank the mode: a full section can't be taken, so it sinks to
 * the bottom whatever the sort; and section number is the universal tie-break,
 * so the order never looks arbitrary. Returns a new array.
 */
export function sortRoutineSections(sections, mode = 'section', ratingValue = () => -1) {
    const decorated = sections.map((s) => ({
        s,
        full: !!s.isFull,
        num: sectionNumber(s.sectionName),
    }));

    let primary;
    if (mode === 'faculty') primary = (a, b) => ratingValue(b.s) - ratingValue(a.s);
    else if (mode === 'seats') primary = (a, b) => seatsLeft(b.s) - seatsLeft(a.s);
    else if (mode === 'time') primary = (a, b) => earliestStart(a.s) - earliestStart(b.s);
    else primary = (a, b) => a.num - b.num;

    decorated.sort((a, b) => {
        if (a.full !== b.full) return a.full ? 1 : -1;
        const p = primary(a, b);
        if (p !== 0) return p;
        return a.num - b.num;
    });
    return decorated.map((d) => d.s);
}
