export function installAdminAccessHooks({ isAdminUser }) {
  window._shohoj_isPaperAdmin = function() {
    return isAdminUser();
  };

  window._shohoj_isAdmin = function() {
    return isAdminUser();
  };
}
