// Twin of src/core/routinePlannerImport.ts — hand-maintained, not generated.
// src/core/routinePlannerImport.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Resolves the student's Planner course codes against the live CONNECT feed so
// the Routine Builder can pre-fill its picker with courses already planned,
// skipping ones not offered this semester or already in the routine. Pure.

function normalizeCode(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().toUpperCase();
}

export function resolvePlanImport(planCourses, index, alreadyPickedCodes = []) {
    const picked = new Set(alreadyPickedCodes.map(normalizeCode).filter(Boolean));
    const seen = new Set();

    const importable = [];
    const notOffered = [];
    const alreadyPicked = [];

    for (const raw of planCourses ?? []) {
        const code = normalizeCode(raw);
        if (!code) continue;
        if (seen.has(code)) continue; // de-dupe the plan list
        seen.add(code);

        if (picked.has(code)) {
            alreadyPicked.push(code);
            continue;
        }
        if (index.has(code)) {
            importable.push(code);
        } else {
            notOffered.push(code);
        }
    }

    importable.sort();
    notOffered.sort();
    alreadyPicked.sort();
    return { importable, notOffered, alreadyPicked };
}

export function summarizePlanImport(result) {
    const parts = [];
    if (result.importable.length > 0) {
        parts.push(`Added ${result.importable.length} course${result.importable.length === 1 ? '' : 's'}`);
    }
    if (result.alreadyPicked.length > 0) {
        parts.push(`${result.alreadyPicked.length} already in routine`);
    }
    if (result.notOffered.length > 0) {
        parts.push(`${result.notOffered.length} not offered this semester (${result.notOffered.join(', ')})`);
    }
    if (parts.length === 0) return 'Nothing to import from your plan.';
    return parts.join(' · ');
}
