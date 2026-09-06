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
  parseFeed,
  type NormalizedSection,
  type SectionIndex,
  type WeekdayName,
} from '../../core/connectFeed';
import {
  emptyRoutineBook,
  readRoutineBook,
  routineForSession,
  serializeRoutineBook,
  withRoutineForSession,
  buildClashMap,
  clearRoutine,
  pickCourse,
  pickSection,
  pickedCourseCodes,
  selectedSections,
  summarizeRoutine,
  unpickCourse,
  type RoutineState,
} from '../../core/routineState';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { parseConnectSchedule, picksFromImport } from '../../core/connectScheduleImport';
import { feedBadgeText, feedBadgeTitle } from '../../core/feedFreshness.ts';
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
// Every semester's picks. A routine is picks against ONE semester's sections,
// and course codes carry across semesters while section ids do not (#633).
function restoreRoutineBook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? readRoutineBook(JSON.parse(raw)) : emptyRoutineBook();
  } catch {
    return emptyRoutineBook();
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
// The one semester that is not a semester: a pasted CONNECT schedule. It may
// describe a term the feed never carried and we never archived, which is the
// whole reason the paste exists (#633).
const IMPORTED_SESSION = 'imported';
type SessionChoice = number | typeof IMPORTED_SESSION | null;

// The student's own timetable, as pasted. Not a cache of anything public, so it
// is personal data and listed as such in personalData.ts.
const ROUTINE_IMPORT_KEY = 'shohoj_routine_import_v1';

function restoreImportedSections(): unknown[] {
  try {
    const raw = localStorage.getItem(ROUTINE_IMPORT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { sections?: unknown };
    return Array.isArray(parsed?.sections) ? parsed.sections : [];
  } catch {
    return [];
  }
}

const SEMESTER_CHOICE_KEY = 'shohoj_routine_semester';

function restoreSemesterChoice(): SessionChoice {
  try {
    const raw = localStorage.getItem(SEMESTER_CHOICE_KEY);
    if (raw === IMPORTED_SESSION) return IMPORTED_SESSION;
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
  const [routine, setRoutine] = useState<RoutineState>(() =>
    routineForSession(restoreRoutineBook(), restoreSemesterChoice()),
  );
  const [courseInput, setCourseInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  // Semesters the Worker has kept (#633). Empty when there is no Worker, when
  // it has archived nothing yet, or when the listing fails — in all three cases
  // the route falls back to the live feed with no switcher, rather than showing
  // a control that cannot work.
  const [archived, setArchived] = useState<ArchivedSemester[]>([]);
  const [chosenSession, setChosenSession] = useState<SessionChoice>(restoreSemesterChoice);
  const [imported, setImported] = useState<unknown[]>(restoreImportedSections);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importNote, setImportNote] = useState('');

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

      // A pasted schedule needs no fetch at all: the paste IS the data, which
      // is why the import works for a semester nobody ever archived.
      if (chosenSession === IMPORTED_SESSION) {
        const { sections } = parseFeed(imported);
        setFeed({
          index: indexByCourse(sections),
          source: 'imported' as FeedSource,
          count: sections.length,
          fetchedAt: 0,
          semester: describeSemester(sections, todayISODate()),
        });
        setLoading(false);
        return () => {
          alive = false;
        };
      }

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
            // `result.source` says how the bytes arrived, and an archived
            // semester always arrives over the network — so it would report
            // itself as "Live". The badge is asked where the data came from,
            // and that answer is the archive (#633).
            source: archiveUrl === null ? result.source : ('archive' as FeedSource),
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
    [chosenSession, imported, config?.papersWorkerUrl ?? null],
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

  // Build a routine from a pasted CONNECT "Class and Exam Schedule".
  //
  // The only path to the semester a student is actually in: the feed is a
  // catalog of every section on offer with no student in it, so their enrolment
  // exists nowhere we can reach except the page in front of them (#633).
  const applyConnectImport = useCallback(() => {
    const result = parseConnectSchedule(importText);
    if (result.sections.length === 0) {
      // Leave the box open and say why — closing it would look like it worked.
      setImportNote(result.warnings.join(' ') || 'Nothing recognisable in that paste.');
      return;
    }
    try {
      localStorage.setItem(ROUTINE_IMPORT_KEY, JSON.stringify({ sections: result.sections }));
    } catch {
      // Storage disabled — the paste won't survive a reload.
    }
    setImported(result.sections);
    setChosenSession(IMPORTED_SESSION);
    setRoutine({ picks: picksFromImport(result) });
    setImportOpen(false);
    const n = result.sections.length;
    setImportNote(
      [`Imported ${n} course${n === 1 ? '' : 's'} from CONNECT.`, ...result.warnings].join(' '),
    );
  }, [importText]);

  const chooseSemester = useCallback((next: SessionChoice) => {
    setChosenSession(next);
    // Load that semester's own picks in the same update. Setting the session by
    // itself would let the persist effect below write the outgoing semester's
    // routine under the incoming semester's key.
    setRoutine(routineForSession(restoreRoutineBook(), next));
  }, []);

  // Persist picks whenever they change, under the semester they belong to.
  useEffect(() => {
    try {
      // Re-read rather than holding the book in state: another tab may have
      // written a different semester since, and this must not clobber it.
      const book = withRoutineForSession(restoreRoutineBook(), chosenSession, routine);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeRoutineBook(book)));
    } catch {
      // Storage full / disabled — picks simply won't survive a refresh.
    }
  }, [routine, chosenSession]);

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
              title={feedBadgeTitle(feed.source, feed.fetchedAt)}
              data-testid="routine-feed-source"
            >
              {feedBadgeText(feed.source, feed.fetchedAt)}
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
          {(archived.length > 0 || imported.length > 0) && (
            <select
              className="routine-semester-picker"
              aria-label="Semester to show"
              value={chosenSession ?? ''}
              data-testid="routine-semester-picker"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') chooseSemester(null);
                else if (raw === IMPORTED_SESSION) chooseSemester(IMPORTED_SESSION);
                else chooseSemester(Number(raw));
              }}
            >
              <option value="">Live feed</option>
              {imported.length > 0 && <option value={IMPORTED_SESSION}>My CONNECT schedule</option>}
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
        {/* The other way in, and the one that answers "show me the semester I
            am actually in" — picking courses by hand only works if you already
            know which sections you are in. */}
        <button
          type="button"
          className={`btn-secondary btn-sm ${importOpen ? 'is-active' : ''}`}
          aria-expanded={importOpen}
          data-testid="routine-import-toggle"
          onClick={() => {
            setImportOpen((open) => !open);
            setImportNote('');
          }}
        >
          📋 Paste CONNECT schedule
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

      {importOpen && (
        <div className="routine-import-panel" data-testid="routine-import-panel">
          <label className="routine-import-label" htmlFor="routine-connect-paste">
            Open CONNECT → Class and Exam Schedule, select the table, copy, and paste it here.
          </label>
          <textarea
            id="routine-connect-paste"
            className="routine-import-box"
            rows={6}
            spellCheck={false}
            value={importText}
            data-testid="routine-import-box"
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="routine-import-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              data-testid="routine-import-apply"
              onClick={applyConnectImport}
            >
              Build my routine
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {importNote !== '' && (
        <p className="routine-import-note" role="status" data-testid="routine-import-note">
          {importNote}
        </p>
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
