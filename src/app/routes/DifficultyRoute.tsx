// src/app/routes/DifficultyRoute.tsx
//
// Course Difficulty Map — the shell port of the legacy js/ui/difficultyMap.js
// tab (#453 parity gap found in the pre-cutover audit). It fetches the recent-
// reviews feed through the same FacultyReviewsProvider seam the /reviews route
// uses, aggregates difficulty + workload per course via the pure difficultyMap
// model, and renders a dept-filterable, sortable grid of course cards. Read-only;
// an offline shell (no repo) yields an empty feed → the empty state. Lazy route
// module (exports `Component`), code-split out of the shell entry.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ReviewLike } from '../../core/reviews';
import { BRACU_COURSE_DB } from '../../features/calculator/catalog';
import { useFetchRecentReviews } from '../../features/calculator/FacultyReviewsProvider';
import {
  buildDifficultyIndex,
  difficultyDepts,
  difficultyLabel,
  filterByDept,
  formatScore,
  scorePct,
  scoreTier,
  sortDifficultyEntries,
  totalReviewCount,
  workloadLabel,
  type DifficultyEntry,
  type DifficultySort,
} from '../../features/calculator/difficultyMap';

// Match the legacy tab's fetch ceiling — the map wants every course, so it pulls
// the full recent feed rather than the small directory sample /reviews uses.
const FETCH_LIMIT = 5000;

const SORTS: readonly { readonly key: DifficultySort; readonly label: string }[] = [
  { key: 'code', label: 'Code' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'workload', label: 'Workload' },
];

function ScoreBar({ label, value }: { readonly label: string; readonly value: number | null }) {
  const tier = scoreTier(value);
  return (
    <div className="dm-bar-row">
      <span className="dm-bar-label">{label}</span>
      <div className="dm-bar-track">
        <div className={`dm-bar-fill dm-bar-fill--${tier || 'none'}`} style={{ width: `${scorePct(value)}%` }} />
      </div>
      <span className={`dm-bar-value dm-bar-value--${tier || 'none'}`}>{formatScore(value)}</span>
    </div>
  );
}

function DifficultyCard({ entry }: { readonly entry: DifficultyEntry }) {
  const tier = scoreTier(entry.difficulty);
  return (
    <div className="dm-card" data-testid="difficulty-card" data-code={entry.code}>
      <div className="dm-card-head">
        <span className="dm-card-code">{entry.code}</span>
        <span className={`dm-card-tag dm-card-tag--${tier || 'none'}`}>{difficultyLabel(entry.difficulty)}</span>
      </div>
      <div className="dm-card-name" title={entry.name}>
        {entry.name}
      </div>
      <ScoreBar label="Difficulty" value={entry.difficulty} />
      <ScoreBar label="Workload" value={entry.workload} />
      <div className="dm-card-foot">
        {entry.count} review{entry.count !== 1 ? 's' : ''}
        {entry.lowSample ? ' · limited sample' : ''}
        {entry.workload !== null ? ` · ${workloadLabel(entry.workload)} load` : ''}
      </div>
    </div>
  );
}

export function Component() {
  const fetchRecent = useFetchRecentReviews();
  // undefined = loading; [] = no reviews; otherwise the aggregated index.
  const [entries, setEntries] = useState<DifficultyEntry[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [activeDept, setActiveDept] = useState('ALL');
  const [sortBy, setSortBy] = useState<DifficultySort>('code');

  // Fetch once on mount; fetchRecent is recreated on provider bumps, read via ref.
  const fetchRef = useRef(fetchRecent);
  fetchRef.current = fetchRecent;
  useEffect(() => {
    let live = true;
    fetchRef
      .current(FETCH_LIMIT)
      .then((reviews: ReviewLike[]) => {
        if (live) setEntries(buildDifficultyIndex(reviews, BRACU_COURSE_DB));
      })
      .catch(() => {
        if (live) {
          setEntries([]);
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const depts = useMemo(() => (entries ? difficultyDepts(entries) : ['ALL']), [entries]);
  const visible = useMemo(
    () => (entries ? sortDifficultyEntries(filterByDept(entries, activeDept), sortBy) : []),
    [entries, activeDept, sortBy],
  );

  // A dept can disappear when the feed reloads; fall back to ALL so the grid
  // never renders empty against a stale filter.
  useEffect(() => {
    if (activeDept !== 'ALL' && !depts.includes(activeDept)) setActiveDept('ALL');
  }, [depts, activeDept]);

  return (
    <section className="shell-page" data-testid="difficulty-page">
      <h1>Course Difficulty Map</h1>

      {entries === undefined ? (
        <p className="dm-loading" role="status">
          Loading course ratings…
        </p>
      ) : failed ? (
        <div className="dm-empty" data-testid="difficulty-failed">
          Couldn’t load review data. Try again in a bit.
        </div>
      ) : entries.length === 0 ? (
        <div className="dm-empty" data-testid="difficulty-empty">
          <div className="dm-empty-title">No reviewed courses yet</div>
          <div className="shell-muted">
            Rate a course from the Calculator or Planner to start the map.
          </div>
        </div>
      ) : (
        <>
          <p className="dm-subtitle shell-muted">
            Based on {totalReviewCount(entries)} review{totalReviewCount(entries) !== 1 ? 's' : ''} across{' '}
            {entries.length} course{entries.length !== 1 ? 's' : ''}. Low-sample courses are marked limited.
          </p>

          <div className="dm-controls">
            <div className="dm-pills" role="group" aria-label="Filter by department">
              {depts.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  className={`dm-pill${dept === activeDept ? ' dm-pill--active' : ''}`}
                  aria-pressed={dept === activeDept}
                  onClick={() => setActiveDept(dept)}
                >
                  {dept === 'ALL' ? 'All' : dept}
                </button>
              ))}
            </div>
            <div className="dm-sort" role="group" aria-label="Sort courses">
              <span className="dm-sort-label">Sort</span>
              {SORTS.map((sort) => (
                <button
                  key={sort.key}
                  type="button"
                  className={`dm-sort-btn${sortBy === sort.key ? ' dm-sort-btn--active' : ''}`}
                  aria-pressed={sortBy === sort.key}
                  onClick={() => setSortBy(sort.key)}
                >
                  {sort.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="dm-empty" data-testid="difficulty-dept-empty">
              No reviewed courses in this department yet.
            </div>
          ) : (
            <div className="dm-grid" data-testid="difficulty-grid">
              {visible.map((entry) => (
                <DifficultyCard key={entry.code} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
