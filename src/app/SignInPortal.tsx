// src/app/SignInPortal.tsx
//
// The signed-out view of the shell. Sign-in is what resolves a student to a
// campus, and the campus decides the grading scale, the course catalog and
// which features exist — so until we know who someone is, there is no correct
// version of the app to show them. That is the reason for the gate: not
// secrecy (Firestore rules are the security boundary), but correctness. A
// calculator that quietly applies BRACU's scale to an NSU transcript is worse
// than one that asks first.
//
// The campus list is read from the registry rather than written out, so adding
// a university updates this page as a side effect of adding the profile.

import { UNIVERSITIES } from '../core/university';
import type { FirebaseAuthSource } from '../platform/auth/firebaseAuthSource';

export interface SignInPortalProps {
  /** Null on a shell with no Firebase config — sign-in cannot work there. */
  readonly source: FirebaseAuthSource | null;
}

export function SignInPortal({ source }: SignInPortalProps) {
  const campuses = Object.values(UNIVERSITIES);

  return (
    <div className="shell-page shell-signin" data-testid="signin-portal">
      <h1 className="shell-signin-title">Sign in to Shohoj</h1>

      <p className="shell-signin-lede">
        Shohoj works from your university&rsquo;s own grading rules. Signing in with
        your student email is how it knows which ones to apply.
      </p>

      {source ? (
        <button
          type="button"
          className="shell-auth-btn shell-signin-btn"
          onClick={() => void source.signIn()}
          data-testid="signin-portal-button"
        >
          Continue with Google
        </button>
      ) : (
        <p className="shell-signin-note" role="status">
          Sign-in isn&rsquo;t available on this build.
        </p>
      )}

      <div className="shell-signin-campuses">
        <p className="shell-signin-campus-label">Supported universities</p>
        <ul className="shell-signin-campus-list">
          {campuses.map((campus) => (
            <li key={campus.id} className="shell-signin-campus">
              <span className="shell-signin-campus-name">{campus.shortName}</span>
              <span className="shell-signin-campus-domain">
                {campus.emailDomains.map((d) => `@${d}`).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Say plainly what signing in does and does not do. The honest version is
          a better pitch than a vague one, and it is the same claim the privacy
          doc makes — cloud sync is opt-in, and it is not this. */}
      <p className="shell-signin-note">
        Signing in identifies your university and unlocks reviews, study groups and
        alerts. Your grades stay in this browser until you turn on sync.
      </p>
    </div>
  );
}

export default SignInPortal;
