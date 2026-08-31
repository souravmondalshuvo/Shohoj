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

import { useCallback, useEffect, useMemo, useState } from 'react';

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
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { feedAgeLabel, feedSourceLabel } from '../../core/feedFreshness.ts';
import {
  archiveCacheKey,
  archiveGapNotice,
  archivePayloadUrl,
  fetchArchiveListing,
  type ArchivedSemester,
} from '../../core/semesterArchive';
import {
  describeSemester,
  semesterCaveat,
  semesterNameFromSessionId,
  semesterHeadline,
  todayISODate,
  type SemesterIdentity,
} from '../../core/semesterIdentity';
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
  fetchedAt: number;
  /** Which semester these sections belong to, and whether it is the one running. */
  semester: SemesterIdentity;
}

/** Remembered choice of semester. Null (or absent) means the live feed. */
const SEMESTER_CHOICE_KEY = 'shohoj_routine_semester';

function restoreSemesterChoice(): number | null {
  try {
    const raw = localStorage.getItem(SEMESTER_CHOICE_KEY);
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function Component() {
  const config = useRuntimeConfig();
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<RoutineState>(restoreRoutine);
  const [courseInput, setCourseInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  // Semesters the Worker has kept (#633). Empty when there is no Worker, when
  // it has archived nothing yet, or when the listing fails — in all three cases
  // the route falls back to the live feed with no switcher, rather than showing
  // a control that cannot work.
  const [archived, setArchived] = useState<ArchivedSemester[]>([]);
  const [chosenSession, setChosenSession] = useState<number | null>(restoreSemesterChoice);

  // Load the CONNECT feed (cache-first, same client as RoomsRoute). Refresh
  // re-fetches past the cache, which legacy has always offered from the header
  // and the shell had dropped along with the badge that says how old the data
  // is (#582).
  //
  // With a semester chosen from the archive it reads the Worker instead of the
  // CDN — same JSON, same parser, its own cache slot so the two never evict
  // each other.
  const load = useCallback(
    (forceRefresh: boolean) => {
      let alive = true;
      setFeedError(null);
      setLoading(true);
      const archiveUrl =
        chosenSession === null
          ? null
          : archivePayloadUrl(config?.papersWorkerUrl ?? null, chosenSession);
      const fetchOptions =
        archiveUrl === null
          ? { forceRefresh }
          : { forceRefresh, url: archiveUrl, cacheKey: archiveCacheKey(chosenSession as number) };
      fetchConnectFeed(fetchOptions)
        .then((result) => {
          if (!alive) return;
          setFeed({
            index: indexByCourse(result.sections),
            source: result.source,
            count: result.sections.length,
            fetchedAt: result.fetchedAt,
            semester: describeSemester(result.sections, todayISODate()),
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
    },
    [chosenSession, config?.papersWorkerUrl ?? null],
  );

  useEffect(() => load(false), [load]);

  // The listing is advisory: it only decides whether a switcher is offered, so
  // it never blocks the route and never surfaces an error of its own.
  useEffect(() => {
    let alive = true;
    fetchArchiveListing({ workerUrl: config?.papersWorkerUrl ?? null }).then((list) => {
      if (alive) setArchived(list);
    });
    return () => {
      alive = false;
    };
  }, [config?.papersWorkerUrl ?? null]);

  // Remember the choice, so a student who lives in the current semester is not
  // put back on next semester's timetable every time they open the tab.
  useEffect(() => {
    try {
      if (chosenSession === null) localStorage.removeItem(SEMESTER_CHOICE_KEY);
      else localStorage.setItem(SEMESTER_CHOICE_KEY, String(chosenSession));
    } catch {
      // Storage disabled — the choice simply won't survive a reload.
    }
  }, [chosenSession]);

  // Persist picks whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routine));
    } catch {
      // Storage full / disabled — picks simply won't survive a refresh.
    }
  }, [routine]);

  // What the chosen semester cannot tell you, when it is a capture rather than
  // a live pull. Null for the live feed and for anything the cron took itself.
  const archiveNote = useMemo(
    () => archiveGapNotice(archived.find((a) => a.sessionId === chosenSession) ?? null),
    [archived, chosenSession],
  );

  const index = feed?.index ?? EMPTY_INDEX;
  const codes = pickedCourseCodes(routine);
  const resolved = useMemo(() => selectedSections(routine, index), [routine, index]);
  const clashMap = useMemo(() => buildClashMap(resolved), [resolved]);
  const layout = useMemo(() => computeGridLayout(resolved), [resolved]);
  const summary = useMemo(() => summarizeRoutine(routine, index), [routine, index]);
  const clashCount = summary.classClashPairs + summary.examClashPairs;

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
    <section className="shell-page routine-page routine-tab" data-testid="routine-page">
      {/* Legacy's one-row header (js/ui/routineTab.js:_headerHTML): title, feed
          badge and Refresh on a single 31px line. The shell spread the same
          information over an <h1>, a description legacy does not have, and a
          separate feed-status paragraph — 100px against legacy's 31, which was
          most of this route's +90 against legacy's panel (#582). Same shape as
          the /rooms pass, which shares this header. */}
      <div className="routine-header">
        <div className="routine-header-left">
          <h1>🗓️ Routine Builder</h1>
          {feed && (
            <span
              className={`routine-source-badge routine-source--${feed.source}`}
              title={`Source: ${feedSourceLabel(feed.source)} • Updated ${feedAgeLabel(feed.fetchedAt)}`}
              data-testid="routine-feed-source"
            >
              {feedSourceLabel(feed.source)} · {feedAgeLabel(feed.fetchedAt)}
            </span>
          )}
          {feed && (
            <span
              className={`routine-semester-badge routine-semester--${feed.semester.status}`}
              title={semesterCaveat(feed.semester)}
              data-testid="routine-semester"
            >
              {semesterHeadline(feed.semester)}
            </span>
          )}
          {archived.length > 0 && (
            <select
              className="routine-semester-picker"
              aria-label="Semester to show"
              value={chosenSession ?? ''}
              data-testid="routine-semester-picker"
              onChange={(e) =>
                setChosenSession(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Live feed</option>
              {archived.map((a) => (
                <option key={a.sessionId} value={a.sessionId}>
                  {semesterNameFromSessionId(a.sessionId) ?? `Session ${a.sessionId}`}
                </option>
              ))}
            </select>
          )}
          {clashCount > 0 && (
            <span
              className="routine-clash-warn"
              title={`Class clashes: ${summary.classClashPairs}, exam clashes: ${summary.examClashPairs}`}
            >
              ⚠ {clashCount} clash{clashCount === 1 ? '' : 'es'}
            </span>
          )}
        </div>
        {/* Legacy also carries Share, Add to Calendar, QR and Clear here once
            courses are picked (_headerHTML). The shell has none of those yet
            and keeps its own Clear in the summary row below, so this stays at
            Refresh — matching legacy exactly in the empty state the parity
            baseline captures, and short of it once picks exist. */}
        <div className="routine-header-right">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => load(true)}
            title="Re-fetch from CONNECT now"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ marginRight: 6 }}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {loading && !feed && (
        <div className="routine-loading" data-testid="routine-loading">
          Loading the course feed…
        </div>
      )}
      {feedError && (
        <div className="routine-error" role="alert">
          {feedError}
        </div>
      )}

      {/* Legacy's picker (_pickerHTML): one row, no visible label — the input
          carries an aria-label instead, which is what legacy does and what
          keeps this a 38px row rather than a 66px stack. */}
      <form className="routine-picker" onSubmit={addCourse}>
        <input
          id="routine-course-input"
          className="routine-input"
          type="text"
          placeholder="Add course (e.g. CSE220) — start typing for matches"
          autoComplete="off"
          spellCheck={false}
          aria-label="Add a course by code"
          value={courseInput}
          onChange={(e) => {
            setCourseInput(e.target.value);
            if (addError) setAddError(null);
          }}
          data-testid="routine-course-input"
        />
        <button type="submit" className="btn-primary btn-sm" data-testid="routine-add-btn">
          Add
        </button>
      </form>
      {addError && (
        <div className="routine-add-error" role="alert" data-testid="routine-add-error">
          {addError}
        </div>
      )}

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
        <div className="routine-empty" data-testid="routine-empty">
          <p>
            Add courses to start planning. Try <code>CSE220</code>, <code>MAT215</code>,{' '}
            <code>BUS102</code>.
          </p>
        </div>
      )}

      {archiveNote !== null && (
        <p className="routine-archive-note" role="status" data-testid="routine-archive-note">
          {archiveNote}
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
