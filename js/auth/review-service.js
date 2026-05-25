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
}
