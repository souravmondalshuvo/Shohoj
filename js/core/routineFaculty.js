// Twin of src/core/routineFaculty.ts — hand-maintained, not generated.
// src/core/routineFaculty.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Cross-references the live CONNECT feed (faculty initials like "ABC") with
// the existing review aggregations so the Routine Builder can show a ★ next
// to each section's faculty. Pure: the async fetch lives in routineTab.js.

export const LOW_SAMPLE_THRESHOLD = 3;

export function ratingTier(overall, count) {
    if (overall === null) return 'unknown';
    if (count < LOW_SAMPLE_THRESHOLD) return 'low-sample';
    if (overall >= 4.3) return 'excellent';
    if (overall >= 3.7) return 'good';
    if (overall >= 3.0) return 'mid';
    if (overall >= 2.0) return 'warn';
    return 'bad';
}

function normalizeKey(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
}

export function buildFacultyRatingMap(aggregated) {
    const out = new Map();
    if (!Array.isArray(aggregated)) return out;
    for (const entry of aggregated) {
        if (!entry || typeof entry !== 'object') continue;
        const key = normalizeKey(entry.facultyInitials);
        if (!key) continue;
        const count = typeof entry.count === 'number' && entry.count > 0 ? entry.count : 0;
        const overall = typeof entry.overall === 'number' ? entry.overall : null;
        out.set(key, {
            initials: key,
            overall,
            count,
            tier: ratingTier(overall, count),
        });
    }
    return out;
}

export function getRatingForSection(section, ratingMap) {
    const key = normalizeKey(section && section.facultyInitials);
    if (!key) return null;
    return ratingMap.get(key) ?? null;
}

export function formatRatingScore(value, digits = 1) {
    if (value === null || Number.isNaN(value)) return '—';
    return value.toFixed(digits);
}

/**
 * Where the built rating map is cached, and for how long.
 *
 * Deliberately NOT personal data — it is public aggregate, which is why both
 * `personalData` copies exclude it from the sign-out wipe. The key, the TTL and
 * the shape below live here rather than in a tab because two front ends write
 * this one key, and a format that drifts between them is a cache that poisons
 * whichever side reads it second (#688).
 */
export const RATING_CACHE_KEY = 'shohoj_routine_ratings_v1';
export const RATING_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** FacultyRating is flat and JSON-safe, so the map serializes as its values. */
export function serializeRatingCache(ratingMap, now = Date.now()) {
    return { at: now, entries: Array.from(ratingMap.values()) };
}

/**
 * Rebuild the map from a cached string, or null when there is nothing usable:
 * absent, unparseable, the wrong shape, expired, or empty. Callers treat null
 * as "not cached" and fetch — so a corrupt entry costs a read, not an error.
 */
export function parseRatingCache(raw, now = Date.now(), ttlMs = RATING_CACHE_TTL_MS) {
    if (typeof raw !== 'string' || raw === '') return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    if (typeof parsed.at !== 'number' || !Array.isArray(parsed.entries)) return null;
    if (now - parsed.at > ttlMs) return null;

    const map = new Map();
    for (const entry of parsed.entries) {
        if (entry && typeof entry.initials === 'string' && entry.initials !== '') {
            map.set(entry.initials, entry);
        }
    }
    return map.size > 0 ? map : null;
}
