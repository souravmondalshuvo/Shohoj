import { isSafeAvatarUrl } from './auth-service.js';

export function installReviewIdentityHooks({ getCurrentUser, isAuthReady }) {
  window._shohoj_currentUid = function() {
    return getCurrentUser()?.uid || null;
  };

  window._shohoj_currentEmail = function() {
    return getCurrentUser()?.email || null;
  };

  window._shohoj_isAuthReady = function() {
    return isAuthReady();
  };

  // Read-only identity snapshot for the Profile account hub. photoURL is passed
  // through the same isSafeAvatarUrl guard the signed-in pill uses, so a hostile
  // Google identity payload can't inject an arbitrary image/URL into the page.
  window._shohoj_userProfile = function() {
    const u = getCurrentUser();
    if (!u) return { signedIn: false, uid: null, email: null, displayName: null, photoURL: null };
    return {
      signedIn:    true,
      uid:         u.uid || null,
      email:       u.email || null,
      displayName: u.displayName || null,
      photoURL:    isSafeAvatarUrl(u.photoURL) ? u.photoURL : null,
    };
  };
}
