// src/app/routes/RoutineRoute.tsx
//
// Weekly Routine builder (Phase 6 shell migration of the legacy routineTab.js,
// #397). This first slice ports the core builder: add a course, pick one of its
// sections from the live CONNECT feed, and see the resulting weekly grid with
// pairwise clash marks. Picks persist across refreshes.
//
// The domain logic is already typed in src/core (routineState / routineGrid /
// connectFeed) — this component is the thin React shell over it, matching how
// CampusRoute consumes the same feed. Richer legacy features (section
// suggestions/combos, PNG export, share link + QR, add-to-calendar, live
// faculty ratings, planner import, avoid-day/sort filters) are deferred to
// follow-up slices under #397.

import { useEffect, useMemo, useState } from 'react';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import {
  indexByCourse,
  type NormalizedSection,
  type SectionIndex,
  type WeekdayName,
} from '../../core/connectFeed';
import {
  buildClashMap,
  clearRoutine,
  emptyRoutineState,
  pickCourse,
  pickSection,
  pickedCourseCodes,
  selectedSections,
  summarizeRoutine,
  unpickCourse,
  type RoutineState,
} from '../../core/routineState';
import { computeGridLayout } from '../../core/routineGrid';

const STORAGE_KEY = 'shohoj_routine_picks_v1';

const DAY_LABEL: Record<WeekdayName, string> = {
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// One-line summary of a section's class meetings, e.g. "Sun 8:00 AM–9:20 AM · Tue …".
function slotSummary(section: NormalizedSection): string {
  if (section.classSlots.length === 0) return 'No scheduled class slots';
  return section.classSlots
    .map((s) => `${DAY_LABEL[s.day]} ${fmtMinutes(s.startMin)}–${fmtMinutes(s.endMin)}`)
    .join(' · ');
}

// Lenient restore: only accept the { picks: Record<string, number|null> } shape.
// The legacy tab persists a different schema under a different key, so a bad or
// foreign value just resets to empty rather than throwing.
function restoreRoutine(): RoutineState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRoutineState();
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { picks?: unknown }).picks !== 'object' ||
      (parsed as { picks?: unknown }).picks === null
    ) {
      return emptyRoutineState();
    }
    const picks: Record<string, number | null> = {};
    for (const [code, sid] of Object.entries(
      (parsed as { picks: Record<string, unknown> }).picks,
    )) {
      if (sid === null || (typeof sid === 'number' && Number.isFinite(sid))) {
        picks[code.toUpperCase()] = sid as number | null;
      }
    }
    return { picks };
  } catch {
    return emptyRoutineState();
  }
}

interface FeedState {
  index: SectionIndex;
  source: FeedSource;
  count: number;
}

export function Component() {
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<RoutineState>(restoreRoutine);
  const [courseInput, setCourseInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Load the CONNECT feed once (cache-first, same client as CampusRoute).
  useEffect(() => {
    let alive = true;
    fetchConnectFeed()
      .then((result) => {
        if (!alive) return;
        setFeed({
          index: indexByCourse(result.sections),
          source: result.source,
          count: result.sections.length,
        });
      })
      .catch(() => {
        if (alive) setFeedError('Could not load the course feed. Try again shortly.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Persist picks whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routine));
    } catch {
      // Storage full / disabled — picks simply won't survive a refresh.
    }
  }, [routine]);

  const index = feed?.index ?? EMPTY_INDEX;
  const codes = pickedCourseCodes(routine);
  const resolved = useMemo(() => selectedSections(routine, index), [routine, index]);
  const clashMap = useMemo(() => buildClashMap(resolved), [resolved]);
  const layout = useMemo(() => computeGridLayout(resolved), [resolved]);
  const summary = useMemo(() => summarizeRoutine(routine, index), [routine, index]);

  const addCourse = (event: React.FormEvent) => {
    event.preventDefault();
    const code = courseInput.trim().toUpperCase();
    if (code === '') return;
    if (!feed) {
      setAddError('The course feed is still loading.');
      return;
    }
    if (!index.has(code)) {
      setAddError(`No course "${code}" in the current feed.`);
      return;
    }
    setRoutine((prev) => pickCourse(prev, code));
    setCourseInput('');
    setAddError(null);
  };

  return (
    <section className="shell-page routine-page" data-testid="routine-page">
      <h1>Weekly Routine</h1>
      <p className="shell-muted">
        Build a clash-free weekly schedule: add a course, pick a section, and the grid below fills
        in. Class-time and exam clashes are flagged as you go.
      </p>

      {loading && (
        <p className="routine-feed-status" data-testid="routine-loading">
          Loading the course feed…
        </p>
      )}
      {feedError && (
        <p className="routine-feed-status routine-feed-error" role="alert">
          {feedError}
        </p>
      )}
      {feed && (
        <p className="routine-feed-status shell-muted" data-testid="routine-feed-source">
          {feed.count} sections loaded{feed.source === 'live' ? ' (live)' : ' (cached)'}.
        </p>
      )}

      <form className="routine-add" onSubmit={addCourse}>
        <label className="routine-add-label" htmlFor="routine-course-input">
          Add a course
        </label>
        <div className="routine-add-row">
          <input
            id="routine-course-input"
            className="routine-add-input"
            type="text"
            placeholder="e.g. CSE110"
            autoComplete="off"
            value={courseInput}
            onChange={(e) => {
              setCourseInput(e.target.value);
              if (addError) setAddError(null);
            }}
            data-testid="routine-course-input"
          />
          <button
            type="submit"
            className="shell-btn shell-btn--primary"
            data-testid="routine-add-btn"
          >
            Add
          </button>
        </div>
        {addError && (
          <p className="routine-add-error" role="alert" data-testid="routine-add-error">
            {addError}
          </p>
        )}
      </form>

      {codes.length > 0 ? (
        <>
          <ul className="routine-courses" data-testid="routine-courses">
            {codes.map((code) => {
              const sections = index.get(code) ?? [];
              const pickedId = routine.picks[code] ?? null;
              return (
                <li className="routine-course" key={code} data-testid={`routine-course-${code}`}>
                  <div className="routine-course-head">
                    <span className="routine-course-code">{code}</span>
                    <button
                      type="button"
                      className="routine-remove"
                      onClick={() => setRoutine((prev) => unpickCourse(prev, code))}
                      aria-label={`Remove ${code}`}
                    >
                      ✕
                    </button>
                  </div>
                  {sections.length === 0 ? (
                    <p className="routine-course-empty shell-muted">
                      No sections for {code} in the current feed.
                    </p>
                  ) : (
                    <div
                      className="routine-sections"
                      role="group"
                      aria-label={`Sections for ${code}`}
                    >
                      {sections.map((section) => {
                        const isPicked = section.sectionId === pickedId;
                        const clash = isPicked ? clashMap.get(section.sectionId) : undefined;
                        const hasClash = !!clash && (clash.classClash || clash.examClash);
                        return (
                          <button
                            type="button"
                            key={section.sectionId}
                            className={[
                              'routine-section',
                              isPicked ? 'routine-section--picked' : '',
                              hasClash ? 'routine-section--clash' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-pressed={isPicked}
                            onClick={() =>
                              setRoutine((prev) =>
                                pickSection(prev, code, isPicked ? null : section.sectionId),
                              )
                            }
                          >
                            <span className="routine-section-name">
                              Section {section.sectionName}
                            </span>
                            <span className="routine-section-meta">
                              {section.facultyInitials || 'TBA'}
                              {section.roomName ? ` · ${section.roomName}` : ''}
                              {` · ${section.consumedSeat}/${section.capacity} seats`}
                            </span>
                            <span className="routine-section-slots">{slotSummary(section)}</span>
                            {hasClash && (
                              <span className="routine-section-clash-badge">
                                {clash?.examClash ? 'Exam clash' : 'Time clash'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {pickedId === null && (
                    <p className="routine-course-hint shell-muted">Pick a section above.</p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="routine-summary" data-testid="routine-summary">
            <span>
              {summary.pickedCount} course{summary.pickedCount === 1 ? '' : 's'} ·{' '}
              {summary.resolvedCount} scheduled
            </span>
            {summary.classClashPairs + summary.examClashPairs > 0 ? (
              <span className="routine-summary-clash" data-testid="routine-summary-clash">
                {summary.classClashPairs} time / {summary.examClashPairs} exam clash
                {summary.classClashPairs + summary.examClashPairs === 1 ? '' : 'es'}
              </span>
            ) : (
              summary.resolvedCount > 0 && (
                <span className="routine-summary-ok" data-testid="routine-summary-ok">
                  No clashes
                </span>
              )
            )}
            <button
              type="button"
              className="routine-clear"
              onClick={() => setRoutine((prev) => clearRoutine(prev))}
              data-testid="routine-clear"
            >
              Clear all
            </button>
          </div>
        </>
      ) : (
        <p className="routine-empty shell-muted" data-testid="routine-empty">
          No courses yet. Add one above to start building your routine.
        </p>
      )}

      {layout && (
        <div
          className="routine-grid"
          data-testid="routine-grid"
          role="group"
          aria-label="Weekly class grid"
          style={{
            gridTemplateColumns: `auto repeat(${layout.days.length}, minmax(0, 1fr))`,
            gridTemplateRows: `auto repeat(${layout.totalRows}, 1.4rem)`,
          }}
        >
          {layout.days.map((day, i) => (
            <div
              key={day}
              className="routine-grid-dayhead"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {DAY_LABEL[day]}
            </div>
          ))}
          {layout.rowLabels.map((label, r) =>
            // Label every hour boundary (:00) to avoid a cramped 30-min ladder.
            label.endsWith(':00') ? (
              <div
                key={label + r}
                className="routine-grid-timelabel"
                style={{ gridColumn: 1, gridRow: r + 2 }}
              >
                {label}
              </div>
            ) : null,
          )}
          {layout.blocks.map((block) => {
            const clash = clashMap.get(block.sectionId);
            const hasClash = !!clash && (clash.classClash || clash.examClash);
            return (
              <div
                key={`${block.sectionId}-${block.day}-${block.startMin}`}
                className={hasClash ? 'routine-block routine-block--clash' : 'routine-block'}
                style={{
                  gridColumn: block.dayCol + 2,
                  gridRow: `${block.gridRowStart + 1} / span ${block.gridRowSpan}`,
                  width: `${100 / block.subCols}%`,
                  marginLeft: `${(block.subCol / block.subCols) * 100}%`,
                }}
                title={`${block.courseCode} §${block.sectionName} · ${fmtMinutes(block.startMin)}–${fmtMinutes(block.endMin)} · ${block.facultyInitials || 'TBA'}${block.roomName ? ` · ${block.roomName}` : ''}`}
              >
                <span className="routine-block-code">{block.courseCode}</span>
                <span className="routine-block-room">{block.roomName}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const EMPTY_INDEX: SectionIndex = new Map();
