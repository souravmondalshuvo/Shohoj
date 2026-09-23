// worker/calendarFeed.js — the subscribable calendar feed's identity (#744).
//
// THE URL IS THE CREDENTIAL
//
// A calendar app fetches this endpoint server-to-server and anonymously. There
// is no Firebase token, no cookie, no session and no opportunity to prompt. So
// unlike every other /api/v1 route — where identity comes from a verified token
// and ownership is structural — the only thing standing between a stranger and
// a student's deadlines is that they do not know the URL.
//
// Three consequences, and they are the whole design:
//
//   1. The token is RANDOM, never derived from the uid. Every other id in this
//      system is derived and idempotent, which is right for records: the same
//      inputs should name the same row. It is wrong for a credential. A derived
//      token cannot be revoked without changing who the student is.
//
//   2. It is stored in its own collection keyed BY the token, so resolving one
//      is a single keyed read with no index and no query — the same shape the
//      derived ids buy elsewhere, reached a different way.
//
//   3. It must never be logged. A token in a request path is written to disk on
//      every poll by any logger that records paths, and this Worker's own error
//      handler records `url.pathname`. `redactFeedPath` exists for that, and is
//      not optional.

/** `cft_` + 32 hex. 128 bits of randomness: unguessable, and it fits in a URL. */
const TOKEN_PATTERN = /^cft_[0-9a-f]{32}$/;

/** Where a feed lives. `.ics` because some calendar clients sniff the suffix. */
const FEED_PREFIX = '/feeds/tasks/';
const FEED_SUFFIX = '.ics';

/** The collection keyed by token. One keyed read resolves a feed to a student. */
export const CALENDAR_FEED_COLLECTION = 'calendarFeeds';

/**
 * Mint a token from injected randomness.
 *
 * `randomHex` is passed in rather than read here so the caller owns the entropy
 * source — the Worker uses `crypto.getRandomValues`, and a test can pin a value
 * without this module knowing either exists.
 */
export function calendarFeedToken(randomHex) {
  const hex = String(randomHex ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('calendarFeedToken needs 32 hex characters of randomness');
  }
  return `cft_${hex}`;
}

/** True for a well-formed token. Shape only — says nothing about existence. */
export function isCalendarFeedToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/** The public URL path for a token. */
export function calendarFeedPath(token) {
  return `${FEED_PREFIX}${token}${FEED_SUFFIX}`;
}

/**
 * The token in a feed path, or null.
 *
 * Returns null for anything that is not exactly the expected shape, so a
 * malformed request is refused before it can cost a Firestore read. That is
 * also what stops the token space from being swept cheaply: a guess has to be
 * well-formed before it is worth anything, and a well-formed guess is one in
 * 2^128.
 */
export function parseCalendarFeedPath(pathname) {
  if (typeof pathname !== 'string') return null;
  if (!pathname.startsWith(FEED_PREFIX) || !pathname.endsWith(FEED_SUFFIX)) return null;
  const token = pathname.slice(FEED_PREFIX.length, pathname.length - FEED_SUFFIX.length);
  return isCalendarFeedToken(token) ? token : null;
}

/**
 * A feed path with the token removed, safe to log.
 *
 * Every other path passes through unchanged, so a caller can redact
 * unconditionally rather than remembering which routes are sensitive — the
 * version that has to be remembered is the version that eventually is not.
 */
export function redactFeedPath(pathname) {
  if (typeof pathname !== 'string') return pathname;
  if (!pathname.startsWith(FEED_PREFIX)) return pathname;
  return `${FEED_PREFIX}<redacted>${FEED_SUFFIX}`;
}
