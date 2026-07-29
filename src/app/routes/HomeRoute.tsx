// src/app/routes/HomeRoute.tsx
//
// Landing route for the React Router shell. The markup mirrors the legacy
// page's hero and features section (index.html:179-260) class-for-class,
// because css/style.css is now the shell's stylesheet and its rules are written
// against that structure. e2e-visual/ diffs this against baselines captured
// from the legacy page, so the class names and data-reveal-* hooks are load
// bearing — they are not decorative.
//
// Deliberately NOT wrapped in .shell-page (a 720px glass card) or a bare
// <section> (style.css:366 constrains those to 900px with 5rem padding). The
// legacy hero is a top-level <div class="hero">; only #features is a <section>.

import { Link } from 'react-router';

import { useAuth } from '../providers/AuthProvider';
import { useCapabilities } from '../providers/RuntimeConfigProvider';

const STATS: ReadonlyArray<{ count: number; suffix: string; label: string }> = [
  { count: 857, suffix: '', label: 'Courses in Catalog' },
  { count: 16, suffix: '', label: 'Departments' },
  { count: 100, suffix: '%', label: 'Free & Open Source' },
];

const FEATURES: ReadonlyArray<{
  phase: string;
  soon?: boolean;
  icon: string;
  title: string;
  desc: string;
}> = [
  {
    phase: 'Phase 1 — Live',
    icon: '🧮',
    title: 'Smart CGPA Calculator',
    desc: "BRACU's exact grading scale. Import transcripts, simulate targets, plan retakes, and track your progress.",
  },
  {
    phase: 'Phase 1 — Live',
    icon: '🎓',
    title: 'Degree Tracker',
    desc: 'Visual timeline of your degree — credits earned vs required, semester progress, and estimated graduation date.',
  },
  {
    phase: 'Phase 1 — Live',
    icon: '📅',
    title: 'Semester Planner',
    desc: 'Build your next semester with prerequisite-aware recommendations, unlock counts, and a one-click start into a running semester.',
  },
  {
    phase: 'Phase 1 — Live',
    icon: '⭐',
    title: 'Faculty Reviews',
    desc: 'Pseudonymous 5-dimension ratings — teaching, marking, behavior, difficulty, workload. Review docs carry no identifier; one review per user per course.',
  },
  {
    phase: 'Phase 2',
    soon: true,
    icon: '📚',
    title: 'Resource Library',
    desc: 'Crowdsourced past papers, notes, and lab guides organized by course code.',
  },
  {
    phase: 'Phase 4',
    soon: true,
    icon: '💼',
    title: 'Career Board',
    desc: 'Internships, alumni directory, and interview experiences shared by BRACU students.',
  },
];

export function Component() {
  const { cloud } = useCapabilities();
  const { uid } = useAuth();

  // Legacy swaps this label on the shohoj:auth-changed event (index.html:777);
  // the static "Open Calculator" in the markup is only ever visible before auth
  // resolves. Mirrored here so the signed-out baseline matches.
  const calculatorLabel = uid ? 'Go to Calculator' : 'Try CGPA Calculator';

  return (
    <>
      <div className="hero">
        <div className="hero-glow" />
        <div className="hero-badge" data-reveal-hero>
          <div className="hero-badge-dot" />
          Built at BRAC University · Phase 2 Live
        </div>
        <h1 data-reveal-hero>
          University Life,
          <br />
          Made Simple.
          <span className="bengali">সহজ</span>
        </h1>
        <p className="hero-sub" data-reveal-hero>
          Your courses, CGPA, retake strategy, and degree progress — all in one place. Built for
          BRACU students.
        </p>
        <div className="hero-cta" data-reveal-hero>
          {/* Legacy wires this straight to startDemoMode (js/main.js:820). Here
              loadDemo is scoped to the calculator's bridge, so the intent travels
              as router state and CalculatorRoute honours it on arrival — the
              button seeds demo data rather than merely landing on the calculator. */}
          <Link to="/calculator" state={{ loadDemo: true }} className="btn-primary magnetic">
            Try Demo Mode
          </Link>
          <Link to="/calculator" className="btn-secondary magnetic">
            {calculatorLabel}
          </Link>
          <a
            href="https://github.com/souravmondalshuvo/Shohoj"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary magnetic"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ verticalAlign: '-2px', marginRight: '6px' }}
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View on GitHub
          </a>
        </div>
        <div className="hero-stats">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="stat"
              data-reveal-stat
              data-count={stat.count}
              data-suffix={stat.suffix}
            >
              <div className="stat-num">
                {stat.count}
                {stat.suffix}
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section id="features">
        <div className="reveal from-bottom">
          <div className="section-label" data-reveal-label>
            What We&apos;re Building
          </div>
          <h2 className="section-title" data-reveal-title>
            Everything a student needs.
            <br />
            Nothing they don&apos;t.
          </h2>
          <p className="section-desc" data-reveal-desc>
            Starting with the academic tools every BRACU student needs right now — and growing into
            a full university life platform.
          </p>
        </div>
        <div className="features-grid">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="feature-card lg-surface" data-reveal-card>
              <div className={feature.soon ? 'feature-phase soon' : 'feature-phase'}>
                {feature.phase}
              </div>
              <div className="feature-icon">{feature.icon}</div>
              <div className="feature-title">{feature.title}</div>
              <div className="feature-desc">{feature.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* The live consumer of the runtime-config boundary (runtime-config.spec).
          Legacy has no equivalent line, so it sits outside the hero and
          #features — the two elements e2e-visual/ captures. */}
      <p className="shell-muted home-cloud">
        Cloud features: {cloud ? 'available' : 'offline (local tools still work)'}
      </p>
    </>
  );
}
