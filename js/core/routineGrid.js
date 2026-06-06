// Generated from src/core/routineGrid.ts for the vanilla JS runtime.
// Update src/core/routineGrid.ts first, then regenerate this file.
//
// Pure helpers that turn a selected routine into positioning data for a
// weekly-calendar grid. UI-agnostic: outputs grid rows/cols + minute bounds;
// the renderer maps to CSS grid or pixel offsets.

const WEEK_ORDER = [
    'SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY',
];

export const DEFAULT_ROW_MINUTES = 30;
export const DEFAULT_MIN_HOUR = 8;
export const DEFAULT_MAX_HOUR = 19;

function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }
function snapDown(min, g) { return Math.floor(min / g) * g; }
function snapUp(min, g)   { return Math.ceil(min / g) * g; }

function formatRowLabel(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

export function computeGridLayout(routine, options = {}) {
    const rowMinutes = options.rowMinutes ?? DEFAULT_ROW_MINUTES;
    const pruneEmptyDays = options.pruneEmptyDays !== false;
    if (rowMinutes <= 0) throw new Error('rowMinutes must be positive');
    if (!routine || routine.length === 0) return null;

    let earliest = Infinity, latest = -Infinity;
    const daysWithClasses = new Set();
    for (const s of routine) {
        for (const slot of s.classSlots) {
            if (slot.startMin < earliest) earliest = slot.startMin;
            if (slot.endMin > latest) latest = slot.endMin;
            daysWithClasses.add(slot.day);
        }
    }
    if (earliest === Infinity) return null;

    const lowerBoundMin = options.minHour !== undefined
        ? options.minHour * 60
        : snapDown(earliest, rowMinutes);
    const upperBoundMin = options.maxHour !== undefined
        ? options.maxHour * 60
        : snapUp(latest, rowMinutes);

    const startMin = clamp(lowerBoundMin, 0, 24 * 60 - rowMinutes);
    const endMin = clamp(upperBoundMin, startMin + rowMinutes, 24 * 60);

    const days = pruneEmptyDays
        ? WEEK_ORDER.filter(d => daysWithClasses.has(d))
        : [...WEEK_ORDER];

    const totalRows = (endMin - startMin) / rowMinutes;
    const rowLabels = [];
    for (let i = 0; i < totalRows; i++) {
        rowLabels.push(formatRowLabel(startMin + i * rowMinutes));
    }

    const blocks = [];
    for (const s of routine) {
        for (const slot of s.classSlots) {
            const dayCol = days.indexOf(slot.day);
            if (dayCol === -1) continue;
            const localStart = clamp(slot.startMin, startMin, endMin);
            const localEnd = clamp(slot.endMin, startMin, endMin);
            if (localEnd <= localStart) continue;
            const rowStart = Math.floor((localStart - startMin) / rowMinutes);
            const rowEnd = Math.ceil((localEnd - startMin) / rowMinutes);
            blocks.push({
                sectionId: s.sectionId,
                courseCode: s.courseCode,
                sectionName: s.sectionName,
                facultyInitials: s.facultyInitials,
                roomName: s.roomName,
                day: slot.day,
                dayCol,
                gridRowStart: rowStart + 1,
                gridRowSpan: Math.max(1, rowEnd - rowStart),
                startMin: slot.startMin,
                endMin: slot.endMin,
            });
        }
    }

    return { days, startMin, endMin, rowMinutes, totalRows, rowLabels, blocks };
}
