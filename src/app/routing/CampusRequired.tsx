// src/app/routing/CampusRequired.tsx
//
// What the shell shows when it is signed in but cannot name a campus.
//
// This is a real state, not a defensive stub. `evaluateCampusAccess` admits
// admins on their claim alone and gives them `university: null`, and a session
// that outlives a registry change lands here too. Either way the honest answer
// is the same: the academic rules — grading scale, retake policy, credit
// limits — are campus-specific, and Shohoj does not have a neutral default to
// fall back on. BRACU's scale is BRACU's, not a house standard.
//
// Kept in one place because the alternative is each route inventing its own
// copy for the same condition, and the temptation at every one of those sites
// is to skip the notice and reach for `?? UNIVERSITIES.bracu` instead.

export function CampusRequired() {
  return (
    <section className="shell-page" role="alert" data-testid="campus-required">
      <h1>We don&rsquo;t know your campus</h1>
      <p className="shell-muted">
        This screen works from your university&rsquo;s own grading rules, and this account
        isn&rsquo;t resolving to one. Signing out and back in with your student email usually fixes
        it.
      </p>
    </section>
  );
}

export default CampusRequired;
