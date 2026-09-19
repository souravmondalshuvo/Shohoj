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
// #397. Sort, filters and clash-hiding landed in #682, planner import in #684,
// auto-suggest in #686, faculty ratings in #688 and the exports (share link,
// QR, PNG, calendar) in #690, off the same pure helpers the legacy tab uses.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import {
  hasClassClash,
  hasExamClash,
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
  decodeRoutinePicks,
  emptyRoutineState,
  encodeRoutinePicks,
  pickCourse,
  pickSection,
  pickedCourseCodes,
  selectedSections,
  summarizeRoutine,
  unpickCourse,
  type RoutineState,
} from '../../core/routineState';
import { useCalculator } from '../providers/CalculatorProvider';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { resolvePlanImport, summarizePlanImport } from '../../core/routinePlannerImport';
import {
  formatRatingScore,
  getRatingForSection,
  type FacultyRating,
} from '../../core/routineFaculty';
import { useFacultyRatings } from '../../features/routine/useFacultyRatings';
import {
  ROUTINE_GAP_WEIGHT,
  formatGapMinutes,
  suggestCombinations,
  type Suggestion,
  type SuggestionsResult,
} from '../../core/routineSuggestions';
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
import { buildRoutineICS } from '../../core/calendarExport';
import { buildExportPlan, exportFileName } from '../../core/routineExport';
import { paintExportPlan } from '../../features/routine/paintExportPlan';
import qrcode from 'qrcode-generator';
import {
  SECTION_SORT_MODES,
  type SectionFilters,
  type SectionSortMode,
  seatsLeft,
  sectionPassesFilters,
  sortSections,
} from '../../core/routineSectionList';

const STORAGE_KEY = 'shohoj_routine_picks_v1';

/**
 * Read a `?routine=…` shared-link payload once, and strip it from the URL.
 *
 * Read at import time rather than in an effect: stripping is what stops a
 * later refresh re-applying the shared picks over edits made since, and an
 * effect that runs twice (StrictMode) would read the already-stripped URL.
 */
/** Hand the browser a file. The anchor is removed either way. */
function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadUrl(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PENDING_SHARE: string | null = (() => {
  try {
    if (typeof location === 'undefined') return null;
    const raw = new URLSearchParams(location.search).get('routine');
    if (!raw) return null;
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
    return raw;
  } catch {
    return null;
  }
})();

/** Weekday order for the avoid-day chips, as legacy lists them. */
const DAY_ORDER: readonly WeekdayName[] = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

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

/** Tier colour for a combination's AVERAGE rating. Legacy buckets the average
    by score rather than reusing ratingTier, which judges one faculty against a
    review count the average does not have (_comboCardHTML). */
function avgRatingTier(avg: number): string {
  if (avg >= 4.3) return 'excellent';
  if (avg >= 3.7) return 'good';
  if (avg >= 3.0) return 'mid';
  if (avg >= 2.0) return 'warn';
  return 'bad';
}

/** Legacy's ★ badge (_facultyBadgeHTML): tier class, score, and a hover line
    that says how much evidence is behind it. Renders nothing when ratings are
    not loaded or the faculty is unrated — an absent badge, never a blank one. */
function FacultyBadge({
  section,
  ratingMap,
  loaded,
}: {
  section: Pick<NormalizedSection, 'facultyInitials'>;
  ratingMap: Map<string, FacultyRating>;
  loaded: boolean;
}) {
  if (!loaded) return null;
  const rating = getRatingForSection(section, ratingMap);
  if (!rating || rating.tier === 'unknown') return null;
  const score = formatRatingScore(rating.overall);
  const reviews = `${rating.count} review${rating.count === 1 ? '' : 's'}`;
  return (
    <span
      className={`routine-faculty-badge routine-faculty-badge--${rating.tier}`}
      title={
        rating.tier === 'low-sample'
          ? `Low sample (${reviews})`
          : `Faculty rating ${score} from ${reviews}`
      }
      data-testid="routine-faculty-badge"
    >
      ★ {score}
    </span>
  );
}

export function Component() {
  const config = useRuntimeConfig();
  // The Planner's courses. Legacy reaches them through a window bridge
  // (_shohoj_getPlanCourses); on the shell they are calculator state, which
  // RootLayout hoists above every route.
  const { state: calcState } = useCalculator();
  const { ratingMap, loaded: ratingsLoaded } = useFacultyRatings();
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
  const [sortMode, setSortMode] = useState<SectionSortMode>('section');
  const [hideClashing, setHideClashing] = useState(false);
  const [filters, setFilters] = useState<SectionFilters>({
    noEarly: false,
    noEvening: false,
    avoidDays: [],
  });
  const [importOpen, setImportOpen] = useState(false);
  const [planNote, setPlanNote] = useState('');
  // "Compact days" is a ranking preference, not a section filter, so it lives
  // beside the filters rather than in them — exactly as legacy has it.
  const [compactDays, setCompactDays] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestionsResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const sharePending = useRef<string | null>(PENDING_SHARE);
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
  const applyConnectText = useCallback((text: string, origin: 'clipboard' | 'box'): boolean => {
    const result = parseConnectSchedule(text);
    if (result.sections.length === 0) {
      // Text typed into the box is a deliberate attempt and deserves an
      // explanation. The clipboard was read on spec and may hold a URL, so its
      // failure is not news — it just means the box opens, which is where the
      // click was heading anyway.
      if (origin === 'clipboard') return false;
      // Leave the box open and say why — closing it would look like it worked.
      setImportNote(result.warnings.join(' ') || 'Nothing recognisable in that paste.');
      return false;
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
    const from = origin === 'clipboard' ? 'your clipboard' : 'CONNECT';
    setImportNote(
      [`Imported ${n} course${n === 1 ? '' : 's'} from ${from}.`, ...result.warnings].join(' '),
    );
    return true;
  }, []);

  const applyConnectImport = useCallback(
    () => void applyConnectText(importText, 'box'),
    [applyConnectText, importText],
  );

  /**
   * The button, which tries the clipboard before it offers a box.
   *
   * The schedule is almost always already on the clipboard — the student just
   * copied the table in CONNECT — so a textarea to paste into is three steps
   * where one will do. Every way the read can fail (no async clipboard API, an
   * insecure context, a refused permission) means the same thing: open the box,
   * and say nothing. An empty clipboard is not an error.
   */
  const onConnectImportClick = useCallback(async () => {
    if (importOpen) {
      setImportOpen(false);
      setImportNote('');
      return;
    }
    let text = '';
    try {
      if (navigator.clipboard?.readText) text = (await navigator.clipboard.readText()) || '';
    } catch {
      text = '';
    }
    if (text && applyConnectText(text, 'clipboard')) return;
    setImportOpen(true);
    setImportNote('');
  }, [applyConnectText, importOpen]);

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

  /** A section's rating on the engine's scale; below 0 means "no opinion",
      which is how an unrated faculty sinks under a rated one rather than
      leading the list on a 0 it never earned. */
  const ratingValue = useCallback(
    (section: NormalizedSection) => {
      if (!ratingsLoaded) return -1;
      const rating = getRatingForSection(section, ratingMap);
      return rating && rating.tier !== 'unknown' && rating.overall !== null ? rating.overall : -1;
    },
    [ratingsLoaded, ratingMap],
  );

  const toggleAvoidDay = (day: string) =>
    setFilters((prev) => {
      const days = prev.avoidDays ?? [];
      return {
        ...prev,
        avoidDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
      };
    });

  /** Credits the current picks add up to, falling back to a course's first
      section for a course whose section is not chosen yet — the same estimate
      legacy shows, so the number does not jump when a pick is made. */
  const plannedCredits = useMemo(() => {
    let total = 0;
    for (const code of codes) {
      const list = index.get(code) ?? [];
      if (list.length === 0) continue;
      const sid = routine.picks[code];
      const section = (sid != null && list.find((s) => s.sectionId === sid)) || list[0];
      if (section && Number.isFinite(section.credits)) total += section.credits;
    }
    return total;
  }, [codes, index, routine]);

  /** Does this section clash with any OTHER course's pick? The section's own
      course is excluded: swapping within a course is not a clash with itself. */
  const candidateClashes = useCallback(
    (section: NormalizedSection, courseCode: string) =>
      resolved.some(
        (picked) =>
          picked.courseCode !== courseCode &&
          (hasClassClash(section, picked) || hasExamClash(section, picked)),
      ),
    [resolved],
  );

  /** Sections to show for a course, plus what was held back and why. A picked
      section always shows, even once it fails a filter set after the fact. */
  const visibleSections = useCallback(
    (courseCode: string) => {
      const all = index.get(courseCode) ?? [];
      const pickedId = routine.picks[courseCode] ?? null;
      let hiddenFilter = 0;
      let hiddenClash = 0;
      const rows: NormalizedSection[] = [];
      for (const section of sortSections(all, sortMode, ratingValue)) {
        const isPicked = section.sectionId === pickedId;
        if (!isPicked && !sectionPassesFilters(section, filters)) {
          hiddenFilter++;
          continue;
        }
        if (hideClashing && !isPicked && candidateClashes(section, courseCode)) {
          hiddenClash++;
          continue;
        }
        rows.push(section);
      }
      return { rows, hiddenFilter, hiddenClash, total: all.length };
    },
    [index, routine, sortMode, filters, hideClashing, candidateClashes, ratingValue],
  );

  const planCourses = calcState.planCourses;

  /** Add the planned courses CONNECT is offering, and say what was skipped.
      Existing picks are left alone: the resolver reports them as already
      present rather than re-adding and clearing the section chosen for them. */
  const importFromPlan = () => {
    if (!feed) return;
    const result = resolvePlanImport(planCourses, index, pickedCourseCodes(routine));
    setRoutine((prev) => result.importable.reduce((next, code) => pickCourse(next, code), prev));
    setPlanNote(summarizePlanImport(result));
  };

  /** Rank the clash-free combinations of the picked courses.
      The active filters constrain enumeration, so a suggestion can never
      propose a section the list itself refuses to show. Ratings are not loaded
      on the shell yet, so the engine ranks on seats, gaps and exam clashes. */
  const runSuggest = useCallback(
    (compact: boolean) => {
      if (!feed || codes.length === 0) return;
      setSuggestions(
        suggestCombinations(codes, index, ratingMap, {
          sectionFilter: (section) => sectionPassesFilters(section, filters),
          gapWeight: compact ? ROUTINE_GAP_WEIGHT : 0,
        }),
      );
    },
    [feed, codes, index, filters, ratingMap],
  );

  /** Set every section of a combination at once, and close the panel: leaving
      it open over the routine it just changed invites a second, stale apply. */
  const applyCombo = (combo: Suggestion) => {
    setRoutine((prev) =>
      combo.sections.reduce(
        (next, section) => pickSection(next, section.courseCode, section.sectionId),
        prev,
      ),
    );
    setSuggestions(null);
  };

  const shareUrl = useCallback(() => {
    const payload = encodeRoutinePicks(routine);
    const base = typeof location === 'undefined' ? '' : location.origin + location.pathname;
    return `${base}?routine=${encodeURIComponent(payload)}`;
  }, [routine]);

  /** A pill that says what just happened, then gets out of the way. */
  const flashNote = useCallback((message: string) => {
    setShareNote(message);
    window.setTimeout(() => setShareNote(''), 2500);
  }, []);

  const onShare = () => {
    if (codes.length === 0) return;
    const url = shareUrl();
    navigator.clipboard
      ?.writeText(url)
      .then(
        () => flashNote('✓ Link copied'),
        () => flashNote('Press Ctrl/⌘+C to copy'),
      )
      .catch(() => flashNote('Copy failed'));
  };

  /** An .ics of the weekly classes and the mid/final exams, so the student's
      own calendar app fires the reminders rather than this page. */
  const onCalendar = () => {
    if (resolved.length === 0) return;
    downloadBlob(
      new Blob([buildRoutineICS(resolved)], { type: 'text/calendar;charset=utf-8' }),
      'shohoj-routine.ics',
    );
    flashNote('📅 Calendar downloaded');
  };

  const onExportPng = () => {
    const exportLayout = computeGridLayout(resolved);
    if (!exportLayout) return;
    const plan = buildExportPlan(exportLayout, { title: 'Shohoj — Weekly Routine' });
    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(plan.width * scale);
    canvas.height = Math.round(plan.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';
    paintExportPlan(ctx, plan);
    let url: string;
    try {
      url = canvas.toDataURL('image/png');
    } catch {
      // Tainted canvas — nothing here is drawn from another origin, but a
      // failed export must not take the page down with it.
      return;
    }
    downloadUrl(url, exportFileName());
    flashNote('⬇ PNG downloaded');
  };

  // A shared link is picks, not sections that still exist: validate against the
  // live feed, skip what it no longer offers, and leave the current routine
  // alone if nothing survives — a dead link must not wipe a real routine.
  useEffect(() => {
    const encoded = sharePending.current;
    if (encoded === null || !feed) return;
    sharePending.current = null;
    const decoded = decodeRoutinePicks(encoded);
    let next = emptyRoutineState();
    for (const code of pickedCourseCodes(decoded)) {
      const list = index.get(code);
      if (!list) continue;
      next = pickCourse(next, code);
      const sid = decoded.picks[code];
      if (sid != null && list.some((section) => section.sectionId === sid)) {
        next = pickSection(next, code, sid);
      }
    }
    if (pickedCourseCodes(next).length === 0) return;
    setRoutine(next);
    flashNote('🔗 Opened a shared routine');
  }, [feed, index, flashNote]);

  const qrSvg = useMemo(() => {
    if (!qrOpen || codes.length === 0) return '';
    try {
      const qr = qrcode(0, 'M'); // type 0 = auto-size, medium error correction
      qr.addData(shareUrl());
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    } catch {
      return '';
    }
  }, [qrOpen, codes.length, shareUrl]);

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
        {/* Legacy's header toolbar (_headerHTML): the exports appear only once
            there is a routine to export, which is also what keeps the empty
            state identical to the parity baseline. Clear stays in the summary
            row below, where the shell has always had it. */}
        <div className="routine-header-right">
          {shareNote && (
            <span className="routine-share-note" role="status" data-testid="routine-share-note">
              {shareNote}
            </span>
          )}
          {codes.length > 0 && (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                title="Copy a shareable link to this routine"
                data-testid="routine-share"
                onClick={onShare}
              >
                🔗 Share
              </button>
              <button
                type="button"
                className={`btn-secondary btn-sm ${qrOpen ? 'is-active' : ''}`}
                aria-pressed={qrOpen}
                title="Show a scannable QR of the share link"
                data-testid="routine-qr-toggle"
                onClick={() => setQrOpen((open) => !open)}
              >
                📱 QR
              </button>
            </>
          )}
          {resolved.length > 0 && (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                title="Download an .ics calendar of your classes + exams with reminders"
                data-testid="routine-calendar"
                onClick={onCalendar}
              >
                📅 Add to Calendar
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                title="Download this schedule as a PNG image"
                data-testid="routine-export-png"
                onClick={onExportPng}
              >
                ⬇ Export PNG
              </button>
            </>
          )}
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
        {planCourses.length > 0 && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            title="Add courses from your Semester Planner that CONNECT is offering in the semester shown above"
            data-testid="routine-plan-import"
            onClick={importFromPlan}
          >
            ↧ Import from Planner ({planCourses.length})
          </button>
        )}
        <button
          type="button"
          className={`btn-secondary btn-sm ${importOpen ? 'is-active' : ''}`}
          aria-expanded={importOpen}
          data-testid="routine-import-toggle"
          title="Copy your Class and Exam Schedule in CONNECT, then click here"
          onClick={() => void onConnectImportClick()}
        >
          📋 Paste CONNECT schedule
        </button>
      </form>
      {qrOpen && codes.length > 0 && qrSvg !== '' && (
        <div className="routine-qr-panel" data-testid="routine-qr-panel">
          <div
            className="routine-qr-code"
            aria-label="QR code for this routine's share link"
            // The generator emits rect/path geometry only — no text from the
            // payload reaches the markup, so there is nothing to inject.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="routine-qr-cap">
            📱 Scan with another phone to open this routine in Shohoj.
          </div>
        </div>
      )}

      {planNote && (
        <div className="routine-plan-note" role="status" data-testid="routine-plan-note">
          {planNote}
        </div>
      )}
      {addError && (
        <div className="routine-add-error" role="alert" data-testid="routine-add-error">
          {addError}
        </div>
      )}

      {codes.length > 0 && (
        <>
          {/* Legacy's _controlsInner + _filtersInner, on the same markup so the
              shared stylesheet dresses them identically. */}
          <div className="routine-controls" data-testid="routine-controls">
            <div className="routine-stats">
              <span className="routine-stat">
                {codes.length} course{codes.length === 1 ? '' : 's'}
              </span>
              <span className="routine-stat" data-testid="routine-credits">
                {plannedCredits} cr
              </span>
              <span className="routine-stat">
                {summary.resolvedCount}/{codes.length} set
              </span>
              {clashCount > 0 ? (
                <span
                  className="routine-stat routine-stat--clash"
                  title={`Class clashes: ${summary.classClashPairs}, exam clashes: ${summary.examClashPairs}`}
                >
                  ⚠ {clashCount} clash{clashCount === 1 ? '' : 'es'}
                </span>
              ) : (
                <span className="routine-stat routine-stat--ok">✓ no clashes</span>
              )}
            </div>
            <div className="routine-controls-right">
              {/* Hiding clashes can only do anything once something is picked. */}
              {resolved.length > 0 && (
                <button
                  type="button"
                  className={`routine-chip-toggle ${hideClashing ? 'is-active' : ''}`}
                  aria-pressed={hideClashing}
                  title="Hide sections that clash with your current picks"
                  data-testid="routine-hide-clash"
                  onClick={() => setHideClashing((on) => !on)}
                >
                  {hideClashing ? '◉ Hiding clashes' : '◯ Hide clashes'}
                </button>
              )}
              <div className="routine-sort" role="group" aria-label="Sort sections">
                <span className="routine-sort-label">Sort</span>
                {SECTION_SORT_MODES.filter(([mode]) => mode !== 'faculty' || ratingsLoaded).map(
                  ([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`routine-sort-btn ${sortMode === mode ? 'is-active' : ''}`}
                      aria-pressed={sortMode === mode}
                      data-testid={`routine-sort-${mode}`}
                      onClick={() => setSortMode(mode)}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="routine-filters" data-testid="routine-filters">
            <span className="routine-filter-label">Filters</span>
            <button
              type="button"
              className={`routine-filter-toggle ${filters.noEarly ? 'is-active' : ''}`}
              aria-pressed={!!filters.noEarly}
              title="Hide sections starting before 9:00 AM"
              data-testid="routine-filter-early"
              onClick={() => setFilters((f) => ({ ...f, noEarly: !f.noEarly }))}
            >
              No early
            </button>
            <button
              type="button"
              className={`routine-filter-toggle ${filters.noEvening ? 'is-active' : ''}`}
              aria-pressed={!!filters.noEvening}
              title="Hide sections ending after 5:00 PM"
              data-testid="routine-filter-evening"
              onClick={() => setFilters((f) => ({ ...f, noEvening: !f.noEvening }))}
            >
              No evening
            </button>
            <span className="routine-filter-sep" aria-hidden="true" />
            <span className="routine-filter-label">Suggest</span>
            <button
              type="button"
              className={`routine-filter-toggle ${compactDays ? 'is-active' : ''}`}
              aria-pressed={compactDays}
              title="Prefer compact days (fewer idle gaps between classes) when ranking suggestions"
              data-testid="routine-compact-days"
              onClick={() => {
                const next = !compactDays;
                setCompactDays(next);
                // Re-rank live rather than leaving a panel that no longer
                // reflects the preference beside the toggle that changed it.
                if (suggestions) runSuggest(next);
              }}
            >
              Compact days
            </button>
            <span className="routine-filter-sep" aria-hidden="true" />
            <span className="routine-filter-label">Avoid</span>
            <div className="routine-filter-days" role="group" aria-label="Avoid days">
              {DAY_ORDER.map((day) => {
                const on = (filters.avoidDays ?? []).includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`routine-filter-day ${on ? 'is-active' : ''}`}
                    aria-pressed={on}
                    title={`Avoid classes on ${DAY_LABEL[day]}`}
                    data-testid={`routine-avoid-${day}`}
                    onClick={() => toggleAvoidDay(day)}
                  >
                    {DAY_LABEL[day]}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {codes.length > 0 && (
        <div className="routine-suggest-toolbar">
          <button
            type="button"
            className="btn-primary btn-sm"
            title="Find the best clash-free section combinations"
            data-testid="routine-suggest"
            onClick={() => runSuggest(compactDays)}
          >
            ✨ Auto-suggest combinations
          </button>
          <span className="routine-suggest-hint">
            {codes.length} course{codes.length === 1 ? '' : 's'} picked
          </span>
        </div>
      )}

      {suggestions && (
        <div className="routine-suggest-panel" data-testid="routine-suggest-panel">
          <div className="routine-suggest-panel-head">
            <h4>
              {suggestions.suggestions.length === 0
                ? 'No clash-free combinations found'
                : `Top ${suggestions.suggestions.length} clash-free combination${
                    suggestions.suggestions.length === 1 ? '' : 's'
                  }`}
            </h4>
            {suggestions.suggestions.length > 0 && (
              <div className="routine-suggest-meta" data-testid="routine-suggest-meta">
                {suggestions.feasible} feasible of {suggestions.enumerated} enumerated
              </div>
            )}
            <button
              type="button"
              className="routine-remove-x"
              aria-label="Close"
              data-testid="routine-suggest-close"
              onClick={() => setSuggestions(null)}
            >
              ×
            </button>
          </div>

          {/* A course with nothing usable left, and a search that gave up, both
              narrow the answer — saying so beats a shorter list with no reason. */}
          {suggestions.skippedCourses.length > 0 && (
            <div className="routine-suggest-warn" data-testid="routine-suggest-skipped">
              Skipped (no open sections): {suggestions.skippedCourses.join(', ')}
            </div>
          )}
          {suggestions.truncated && (
            <div className="routine-suggest-warn" data-testid="routine-suggest-truncated">
              ⚠ Search truncated at {suggestions.enumerated} combos — too many to enumerate.
            </div>
          )}

          {suggestions.suggestions.length === 0 ? (
            <div className="routine-suggest-empty" data-testid="routine-suggest-empty">
              Try removing a course or relaxing your filters. Enumerated {suggestions.enumerated},
              all had class clashes.
            </div>
          ) : (
            <div className="routine-suggest-cards">
              {suggestions.suggestions.map((combo, i) => {
                const b = combo.breakdown;
                const seatNotes = [];
                if (b.fullCount > 0) seatNotes.push(`${b.fullCount} FULL`);
                if (b.tightCount > 0) seatNotes.push(`${b.tightCount} tight`);
                return (
                  <div
                    className="routine-suggest-card"
                    key={combo.sections.map((x) => x.sectionId).join('-')}
                    data-testid={`routine-suggest-card-${i}`}
                  >
                    <div className="routine-suggest-card-head">
                      <span className="routine-suggest-card-rank">#{i + 1}</span>
                      {/* The average the ranking actually used, in legacy's
                          tier colours — a score with no visible basis reads
                          as arbitrary. Absent while ratings are unloaded. */}
                      {ratingsLoaded && b.avgRating !== null && (
                        <span
                          className={`routine-suggest-card-rating routine-faculty-badge--${avgRatingTier(
                            b.avgRating,
                          )}`}
                          title="Average faculty rating"
                          data-testid={`routine-suggest-rating-${i}`}
                        >
                          ★ {formatRatingScore(b.avgRating)}
                        </span>
                      )}
                      <span className="routine-suggest-card-score" title="Score">
                        score {combo.score.toFixed(1)}
                      </span>
                      {seatNotes.length > 0 && (
                        <span className="routine-suggest-card-seats">{seatNotes.join(' · ')}</span>
                      )}
                      {b.gapMinutes === 0 ? (
                        <span
                          className="routine-suggest-card-gap is-compact"
                          title="No idle gaps between classes"
                        >
                          compact
                        </span>
                      ) : (
                        <span
                          className="routine-suggest-card-gap"
                          title="Total idle time between classes across the week"
                        >
                          {formatGapMinutes(b.gapMinutes)} gaps
                        </span>
                      )}
                      {b.examClashPairs > 0 && (
                        <span className="routine-suggest-card-warn">
                          ⚠ {b.examClashPairs} exam clash{b.examClashPairs === 1 ? '' : 'es'}
                        </span>
                      )}
                    </div>
                    <div className="routine-suggest-card-list">
                      {combo.sections.map((section) => (
                        <div className="routine-suggest-line" key={section.sectionId}>
                          <span className="routine-suggest-line-code">{section.courseCode}</span>
                          <span className="routine-suggest-line-sec">§{section.sectionName}</span>
                          <span className="routine-suggest-line-fac">
                            {section.facultyInitials || 'TBA'}
                            <FacultyBadge
                              section={section}
                              ratingMap={ratingMap}
                              loaded={ratingsLoaded}
                            />
                          </span>
                          <span className="routine-suggest-line-sched">{slotSummary(section)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="routine-suggest-card-actions">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        data-testid={`routine-suggest-apply-${i}`}
                        onClick={() => applyCombo(combo)}
                      >
                        Apply this combination
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {codes.length > 0 ? (
        <>
          <ul className="routine-courses" data-testid="routine-courses">
            {codes.map((code) => {
              const { rows, hiddenFilter, hiddenClash, total } = visibleSections(code);
              const pickedId = routine.picks[code] ?? null;
              const hiddenParts = [];
              if (hiddenClash > 0) hiddenParts.push(`${hiddenClash} clashing`);
              if (hiddenFilter > 0) hiddenParts.push(`${hiddenFilter} filtered`);
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
                  {total === 0 ? (
                    <p className="routine-course-empty shell-muted">
                      No sections for {code} in the current feed.
                    </p>
                  ) : rows.length === 0 ? (
                    // Everything was filtered away. Saying so beats an empty
                    // box that reads as "this course has no sections".
                    <p
                      className="routine-section-empty"
                      data-testid={`routine-sections-empty-${code}`}
                    >
                      No sections match your current picks and filters.
                    </p>
                  ) : (
                    <div
                      className="routine-sections"
                      role="group"
                      aria-label={`Sections for ${code}`}
                    >
                      {rows.map((section) => {
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
                              <FacultyBadge
                                section={section}
                                ratingMap={ratingMap}
                                loaded={ratingsLoaded}
                              />
                              {section.roomName ? ` · ${section.roomName}` : ''}
                              {` · ${section.consumedSeat}/${section.capacity} seats`}
                              {` · ${seatsLeft(section)} left`}
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
                  {hiddenParts.length > 0 && (
                    <div className="routine-section-hidden" data-testid={`routine-hidden-${code}`}>
                      {hiddenParts.join(' · ')} section
                      {hiddenClash + hiddenFilter === 1 ? '' : 's'} hidden
                    </div>
                  )}
                  {pickedId === null && rows.length > 0 && (
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
