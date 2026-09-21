// src/features/tasks/localInstant.ts
//
// The two conversions between `<input type="datetime-local">` and an API
// instant (#735).
//
// `datetime-local` deals in BARE local times — `2026-10-09T23:59`, no zone —
// and the API deals in instants with an offset, because a deadline without one
// does not name a moment. The browser's own offset is what bridges them, which
// makes this the one conversion that has to happen on the client: the server
// cannot know which zone a bare string was typed in, and guessing would move
// deadlines for every student outside its guess.
//
// Both directions live together because they must stay inverses. They were
// about to be written twice — once in the composer, once in the import panel —
// and two copies of a subtle conversion is how they stop agreeing.

/** A bare local `datetime-local` value → an ISO instant, or null if unusable. */
export function localInputToInstant(value: string): string | null {
  if (value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * An ISO instant → the `datetime-local` value that displays it.
 *
 * Built from local calendar parts rather than by slicing `toISOString()`, which
 * would show every student a UTC clock: a deadline at 23:59 in Dhaka would
 * render as 17:59 the same day, and a student correcting the "wrong" time would
 * then move a deadline that was right.
 */
export function instantToLocalInput(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
