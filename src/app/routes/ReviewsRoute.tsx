// src/app/routes/ReviewsRoute.tsx
//
// Browse Reviews — the lean first cut of the /reviews route (#345, Phase 5G
// slice d3c-ii), replacing the placeholder. On open it fetches the recent-
// reviews feed through the FacultyReviewsProvider, builds a faculty directory
// (aggregateByFaculty), and a search box filters it by initials (the pure
// reviewsDirectory model). Read-only; no repo (offline) → empty. Deferred
// (documented): course search, sort/filter controls, per-faculty detail with
// paging, and the rating/report affordances — the full reviewsTab.js port.

import { useEffect, useMemo, useRef, useState } from 'react';

import { aggregateByFaculty } from '../../core/reviews';
import type { FacultyAggregate, RatingKey } from '../../core/reviews';
import { filterDirectory } from '../../features/calculator/reviewsDirectory';
import { useFetchRecentReviews } from '../../features/calculator/FacultyReviewsProvider';

const DIMENSIONS: readonly { readonly key: RatingKey; readonly label: string }[] = [
  { key: 'teaching', label: 'Teach' },
  { key: 'marking', label: 'Marks' },
  { key: 'behavior', label: 'Behav' },
  { key: 'difficulty', label: 'Diff' },
  { key: 'workload', label: 'Work' },
];

const fmt = (value: number | null) => (value !== null ? value.toFixed(1) : '—');

function FacultyCard({ entry }: { readonly entry: FacultyAggregate }) {
  return (
    <div
      className="rv-dir-card"
      data-testid="reviews-faculty-card"
      data-fac={entry.facultyInitials}
    >
      <div className="rv-dir-card-head">
        <span className="rv-dir-initials">{entry.facultyInitials}</span>
        <span className="rv-dir-count">
          {entry.count} review{entry.count !== 1 ? 's' : ''}
        </span>
        <span className="rv-dir-overall" aria-label={`Overall ${fmt(entry.overall)} out of 5`}>
          ★ {fmt(entry.overall)}
        </span>
      </div>
      <div className="rv-dir-dims">
        {DIMENSIONS.map((dim) => (
          <span key={dim.key} className="rv-dir-dim">
            {dim.label}: <strong>{fmt(entry.ratings[dim.key])}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Component() {
  const fetchRecent = useFetchRecentReviews();
  // Four distinct states. Previously a failed read was caught and turned into
  // `[]`, so an outage or a permission failure rendered the cheerful "No
  // reviews yet" empty state — indistinguishable from a genuinely empty
  // directory. `unavailable` now says so honestly and offers a retry.
  const [status, setStatus] = useState<'loading' | 'loaded' | 'unavailable'>('loading');
  const [directory, setDirectory] = useState<FacultyAggregate[]>([]);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch once on mount; fetchRecent is recreated on provider bumps, read via ref.
  const fetchRef = useRef(fetchRecent);
  fetchRef.current = fetchRecent;
  useEffect(() => {
    let live = true;
    setStatus('loading');
    fetchRef
      .current(200)
      .then((reviews) => {
        if (!live) return;
        setDirectory(aggregateByFaculty(reviews));
        setStatus('loaded');
      })
      .catch(() => {
        // The repo has already logged the machine-readable code; the raw SDK
        // message must never reach the user (docs/SECURITY.md).
        if (live) setStatus('unavailable');
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const filtered = useMemo(
    () => (status === 'loaded' ? filterDirectory(directory, query) : []),
    [status, directory, query],
  );

  return (
    <section className="shell-page" data-testid="reviews-page">
      <h1>Faculty Reviews</h1>

      {status === 'loading' ? (
        <p className="rv-dir-loading" role="status">
          Loading reviews…
        </p>
      ) : status === 'unavailable' ? (
        <div className="rv-dir-empty" data-testid="reviews-unavailable" role="alert">
          <div className="rv-dir-empty-title">Reviews are unavailable right now</div>
          <div className="rv-dir-empty-note">
            We couldn’t load the faculty directory. This is a problem on our side, not with your
            account — your other tools still work.
          </div>
          <button type="button" className="rv-dir-retry" onClick={() => setReloadKey((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : directory.length === 0 ? (
        <div className="rv-dir-empty" data-testid="reviews-empty">
          <div className="rv-dir-empty-title">No reviews yet</div>
          <div className="rv-dir-empty-note">
            Rate a faculty from the Calculator or Planner to get the directory started.
          </div>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="rv-dir-search"
            placeholder="Search faculty by initials…"
            aria-label="Search faculty by initials"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="rv-dir-count-note" aria-live="polite">
            {filtered.length} of {directory.length} faculty
          </p>
          {filtered.length === 0 ? (
            <div className="rv-dir-nomatch" data-testid="reviews-no-match">
              No faculty match “{query}”.
            </div>
          ) : (
            <div className="rv-dir-list" data-testid="reviews-directory">
              {filtered.map((entry) => (
                <FacultyCard key={entry.facultyInitials} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
