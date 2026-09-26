// Twin of src/features/tasks/localInstant.ts — hand-maintained, not generated.
// src/features/tasks/localInstant.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// The two conversions between `<input type="datetime-local">` and an API
// instant (#735), for the legacy Tasks tab (#767). A datetime-local value is a
// bare local time; the API wants an instant with an offset, and only the
// browser knows which zone the student typed it in.

/** A bare local `datetime-local` value → an ISO instant, or null if unusable. */
export function localInputToInstant(value) {
  if (value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** An ISO instant → the `datetime-local` value for the same moment locally. */
export function instantToLocalInput(iso) {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
