// js/auth/assistant-service.js
//
// The two identity bridges the Shohoj Assistant launcher needs on the legacy
// page (#533). The launcher lives in the main bundle, which is a classic script
// and cannot import firebase.js (a separate type="module" block) — so, as with
// installReviewIdentityHooks, firebase.js installs window hooks and the UI
// module calls them.
//
// Nothing here is assistant-specific policy: it is the same trust model as the
// rest of the _shohoj_* bridges. The token is only ever handed to the Worker,
// which verifies it and scopes every lookup to that uid server-side.

/**
 * Install the Assistant's auth hooks.
 *
 * @param {object} deps
 * @param {() => unknown} deps.getCurrentUser  Current Firebase user, or null.
 * @param {() => boolean} deps.isCloudSettled  Whether sign-in reconciliation finished.
 * @param {() => Promise<string|null>} deps.getIdToken  Fresh ID token, or null.
 * @param {(snap: unknown) => Promise<boolean>} deps.saveSnapshot  Immediate cloud write.
 * @param {() => unknown} deps.readLocalSnapshot  Parsed local state, or null.
 * @param {(raw: unknown) => string} deps.fingerprint  Content hash of a snapshot.
 * @param {object} [scope]  Injectable global (tests).
 */
export function installAssistantAuthHooks(
  { getCurrentUser, isCloudSettled, getIdToken, saveSnapshot, readLocalSnapshot, fingerprint },
  scope = typeof window !== 'undefined' ? window : undefined,
) {
  if (!scope) return;

  // What the cloud already has, as far as this tab knows. Lets a flush be
  // skipped when nothing has changed since the last one (#553).
  let lastFlushed = null;

  scope._shohoj_idToken = function() {
    return getCurrentUser() ? getIdToken() : Promise.resolve(null);
  };

  // The Assistant answers from users/{uid} in Firestore, not from localStorage,
  // so a student whose latest edits are still sitting in the debounce window
  // would be told they have no saved semesters. The drawer flushes through this
  // before every turn; without a signed-in user or local data there is nothing
  // to push and the caller carries on regardless.
  //
  // It deliberately does nothing while sign-in reconciliation is still open:
  // auth-changed fires before the local-vs-cloud comparison, so writing the
  // local snapshot here could overwrite the account's cloud copy before the
  // conflict is detected — or while the migration dialog is still on screen
  // waiting for the student to choose. A slightly stale answer is recoverable;
  // silently overwriting a semester of work is not.
  scope._shohoj_flushCloudSave = async function() {
    if (!getCurrentUser()) return false;
    if (typeof isCloudSettled === 'function' && !isCloudSettled()) return false;
    const snap = readLocalSnapshot();
    if (!snap) return false;

    // Only write when the data actually moved. The staleness this guards
    // against (#544) is caused by EDITS sitting in the save debounce; a second
    // question about unchanged data does not need a second write, and paying
    // one per question is a Firestore round trip added to every answer (#553).
    const mark = typeof fingerprint === 'function' ? fingerprint(snap) : null;
    if (mark && mark === lastFlushed) return true;

    try {
      const saved = await saveSnapshot(snap);
      if (saved && mark) lastFlushed = mark;
      return saved;
    } catch (_e) {
      return false;
    }
  };
}
