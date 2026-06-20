// src/core/faculty.ts
//
// Typed port of the pure faculty-initials helpers from js/core/faculty.js.
// Only the side-effect-free logic moves here; the runtime profile cache
// (the module-level Map and its upsert/lookup/suggest helpers) stays in the
// vanilla JS module because it is mutable runtime state tied to the Firestore
// data layer, not pure academic logic — see docs/REACT_VITE_MIGRATION.md.
// Behavior parity with the JS version is guarded by tests/typedCoreParity.test.js.

// Normalize raw faculty initials to canonical form: trimmed, uppercased,
// letters only, capped at 6 characters.
export function normalizeInitials(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
}

// True when the normalized initials are a plausible 2–6 letter identifier.
export function isValidInitials(raw: unknown): boolean {
  const norm = normalizeInitials(raw);
  return norm.length >= 2 && norm.length <= 6;
}
