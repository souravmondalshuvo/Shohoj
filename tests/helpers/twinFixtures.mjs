// tests/helpers/twinFixtures.mjs
//
// Behavioural fixtures for the js/ ↔ src/ twin family (#484).
//
// Export-name comparison is the weak net: it would have rated `connectFeed`
// clean despite #479, which lived entirely inside a function body. These are
// the strong net — identical input through both copies, identical output
// required.
//
// Inputs do not have to be *valid*, only identical: a fixture that makes both
// sides throw still proves they agree. The harness reports how many cases
// returned a value versus threw, so a twin cannot look covered on nothing but
// mutual TypeErrors.

/** A frozen clock for any export that takes an injectable `now`. */
const FIXED_NOW = 1_767_225_600_000; // 2026-01-01T00:00:00Z

/** A prerequisite chain plus two unconstrained courses (#478). */
const OFFERED_COURSES = [
  {
    courseCode: 'CSE110',
    courseName: 'Programming Language I',
    credits: 3,
    prerequisiteCourses: '',
  },
  {
    courseCode: 'CSE111',
    courseName: 'Programming Language II',
    credits: 3,
    prerequisiteCourses: '(CSE110)',
  },
  {
    courseCode: 'CSE220',
    courseName: 'Data Structures',
    credits: 3,
    prerequisiteCourses: '(CSE111)',
  },
  { courseCode: 'CSE221', courseName: 'Algorithms', credits: 3, prerequisiteCourses: '(CSE220)' },
  {
    courseCode: 'CSE321',
    courseName: 'Operating Systems',
    credits: 3,
    prerequisiteCourses: '(CSE221)',
  },
  {
    courseCode: 'EEE101',
    courseName: 'Electrical Circuits',
    credits: 3,
    prerequisiteCourses: '(PHY111 AND MAT110) OR (MAT105 AND PHY110)',
  },
  {
    courseCode: 'CSE499',
    courseName: 'Thesis',
    credits: 6,
    prerequisiteCourses: 'consult advisor',
  },
  { courseCode: 'MAT110', courseName: 'Calculus', credits: 3, prerequisiteCourses: '' },
];

const SECTION = {
  sectionId: 101,
  courseCode: 'CSE220',
  sectionName: '01',
  faculties: 'ABC',
  roomName: '09A-20C',
  capacity: 30,
  consumedSeat: 28,
  sectionSchedule: {
    classSchedules: [
      { day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00', room: '09A-20C' },
      { day: 'TUESDAY', startTime: '08:00:00', endTime: '09:20:00' },
    ],
    finalExamDate: '2026-08-20',
    finalExamStartTime: '09:00:00',
    finalExamEndTime: '11:00:00',
  },
  labSchedules: [],
};

const SECTION_B = {
  ...SECTION,
  sectionId: 102,
  sectionName: '02',
  courseCode: 'CSE221',
  roomName: '10B-14A',
  capacity: 30,
  consumedSeat: 30,
};

const CLASHING = {
  ...SECTION,
  sectionId: 103,
  courseCode: 'MAT120',
  sectionSchedule: {
    classSchedules: [{ day: 'SUNDAY', startTime: '08:30:00', endTime: '09:50:00' }],
  },
};

const FEED = [SECTION, SECTION_B, CLASHING];

const SEMESTER = {
  id: 1,
  name: 'Fall 2024',
  running: false,
  summary: false,
  courses: [
    { name: 'Programming (CSE110)', grade: 'A', credits: 3 },
    { name: 'Physics (PHY111)', grade: 'C', credits: 3 },
    { name: 'Seminar (CSE400)', grade: 'P', credits: 1 },
  ],
};
const SEMESTER_RETAKE = {
  id: 2,
  name: 'Spring 2025',
  running: false,
  summary: false,
  courses: [{ name: 'Physics (PHY111)', grade: 'A', credits: 3 }],
};
const SEMESTERS = [SEMESTER, SEMESTER_RETAKE];

const TRANSCRIPT = [
  'BRAC UNIVERSITY',
  'GRADE SHEET',
  'STUDENT ID: 21301234',
  'PROGRAM: Bachelor of Science in Computer Science',
  'SEMESTER: Fall 2024',
  'CSE110 Programming Language I 3.0 A 4.00',
  'PHY111 Principles of Physics I 3.0 B+ 3.30',
  'SEMESTER: Spring 2025',
  'CSE111 Programming Language II 3.0 A- 3.70',
].join('\n');

/**
 * `twin name` → `exported function` → array of argument tuples.
 *
 * Only value-returning, deterministic functions belong here. Clock- and
 * network-dependent exports (exportFileName, fetchConnectFeed) are deliberately
 * absent — see UNCOVERED in twinParity.test.js.
 */
export const FIXTURES = {
  courseMarks: {
    letterForMark: [[100], [97], [96.99], [85], [84.99], [50], [49.99], [0], [-5]],
    computeCourseMarks: [
      // The worked example: mid 18/25, quizzes 8/10, final to come.
      [
        [
          { name: 'Midterm', weight: 25, score: 18, outOf: 25 },
          { name: 'Quizzes', weight: 15, score: 8, outOf: 10 },
          { name: 'Final', weight: 60, score: null, outOf: 100 },
        ],
      ],
      // Partial syllabus — weights below 100.
      [
        [
          { name: 'Midterm', weight: 25, score: 20, outOf: 25 },
          { name: 'Assignment', weight: 15, score: null, outOf: 100 },
        ],
      ],
      // Everything secured, and nothing graded.
      [
        [
          { name: 'Coursework', weight: 90, score: 90, outOf: 90 },
          { name: 'Final', weight: 10, score: null, outOf: 100 },
        ],
      ],
      [[{ name: 'Final', weight: 100, score: null, outOf: 100 }]],
      // Degenerate: no usable weight, divide-by-zero bait, bonus and negatives.
      [[]],
      [[{ name: 'Ghost', weight: 0, score: 10, outOf: 10 }]],
      [[{ name: 'Broken', weight: 50, score: 10, outOf: 0 }]],
      [[{ name: 'Bonus', weight: 25, score: 30, outOf: 25 }]],
      [[{ name: 'Penalty', weight: 50, score: -10, outOf: 50 }]],
    ],
  },

  calendarExport: {
    firstOnOrAfter: [
      [new Date('2026-08-03T00:00:00Z'), 'SUNDAY'],
      [new Date('2026-08-03T00:00:00Z'), 'FRIDAY'],
      [new Date('2026-01-01T00:00:00Z'), 'MONDAY'],
    ],
    buildRoutineICS: [[[]], [[SECTION]], [[SECTION, SECTION_B]]],
  },

  connectFeed: {
    parseTimeToMinutes: [['08:00:00'], ['11:30 AM'], ['1:05 PM'], [''], [null], ['garbage']],
    normalizeSection: [
      [SECTION],
      [SECTION_B],
      [{ sectionId: 9001 }],
      [null],
      [{ courseCode: 'X' }],
    ],
    parseFeed: [[FEED], [[]], [[null, { sectionId: 1 }]], [null]],
    listCourseCodes: [[FEED], [[]]],
    indexByCourse: [[FEED]],
    summarizeFeed: [[FEED], [[]]],
    detectClashes: [[FEED], [[SECTION]], [[]]],
    hasClassClash: [
      [SECTION, CLASHING],
      [SECTION, SECTION_B],
    ],
    hasExamClash: [
      [SECTION, SECTION_B],
      [SECTION, CLASHING],
    ],
    isClashFree: [[[SECTION, SECTION_B]], [[SECTION, CLASHING]]],
  },

  freeRooms: {
    roomTypeKey: [['09A-20C'], ['UB40101'], [''], [null]],
    buildRoomBusyIndex: [[FEED], [[]]],
    listAllRooms: [[FEED], [[]]],
  },

  'gpa-core': {
    calcSemesterGpa: [[SEMESTER], [{ courses: [] }]],
    calculateCgpaTotals: [
      [SEMESTERS, {}],
      [SEMESTERS, { bestGrade: true }],
      [SEMESTERS, { includeRunning: true, includeSummary: true }],
      [[], {}],
    ],
    getRetakenKeys: [
      [SEMESTERS, { bestGrade: false }],
      [SEMESTERS, { bestGrade: true }],
    ],
    getCourseCode: [['Physics (PHY111)'], ['No code here'], ['']],
    getCourseIdentity: [['Physics (PHY111)'], ['Independent Study']],
    clampGradePoint: [[5], [-1], [2.7], [NaN]],
    normalizeGradePoint: [
      ['3.7', 3],
      ['abc', 3],
      ['4.5', 3],
    ],
    getImprovementStrategy: [['F'], ['C'], ['A'], ['F(NT)'], ['W']],
    isRepeatEligible: [['F'], ['C'], ['B'], ['A']],
    getSemesterCreditWarning: [[SEMESTER], [{ courses: [] }]],
  },

  milestones: {
    standingTierFor: [[4.0], [3.97], [3.5], [2.0], [1.5], [null]],
    computeMilestoneLadder: [
      [{ points: 216, cgpaCredits: 60, remaining: 60 }],
      [{ points: 180, cgpaCredits: 90, remaining: 30 }],
      [{ points: 0, cgpaCredits: 0, remaining: 136 }],
      [{ points: 0, cgpaCredits: 0, remaining: 0 }],
    ],
    isGoal: [[{ id: 'perfect' }], [{ id: 'probation' }]],
  },

  prereq: {
    parsePrerequisites: [
      ['(CSE221)'],
      ['(PHY111 AND MAT110) OR (MAT105 AND PHY110)'],
      ['(CSE340 AND CSE321 AND CSE331) OR (EEE410 AND CSE321 AND CSE331)'],
      ['CSE110 AND CSE111 OR CSE221'],
      ['(EEE101L)'],
      [''],
      [null],
      // Malformed, each a different way to be wrong.
      ['(CSE221'],
      ['CSE221)'],
      ['CSE221 AND'],
      ['CSE221 CSE110'],
      ['NOT CSE221'],
      ['consult advisor'],
      ['()'],
    ],
    evaluatePrerequisites: [
      ['(PHY111 AND MAT110) OR (MAT105 AND PHY110)', new Set(['PHY111'])],
      ['(PHY111 AND MAT110) OR (MAT105 AND PHY110)', new Set(['MAT105', 'PHY110'])],
      ['CSE340 AND CSE321 AND CSE331', new Set(['CSE321'])],
      ['(CSE221)', new Set()],
      ['consult advisor', new Set()],
      ['', new Set()],
    ],
    gradeSatisfiesPrereq: [['A'], ['D-'], ['P'], ['F'], ['F(NT)'], ['W'], ['I'], [''], ['  ']],
    normalizePrereqCode: [['cse220'], ['  CSE220  '], [''], [null]],
    prereqCodes: [
      [{ kind: 'course', code: 'CSE221' }],
      [
        {
          kind: 'or',
          children: [
            {
              kind: 'and',
              children: [
                { kind: 'course', code: 'PHY111' },
                { kind: 'course', code: 'MAT110' },
              ],
            },
            { kind: 'course', code: 'MAT105' },
          ],
        },
      ],
    ],
    // completedCodes is absent on purpose: its second argument is an injected
    // extractCode function, and the harness structuredClones every fixture arg.
    // Its grade policy is the same gradeSatisfiesPrereq covered just above.
    buildUnlockMap: [
      [OFFERED_COURSES, new Set(['CSE110'])],
      [OFFERED_COURSES, new Set(['CSE110', 'CSE111'])],
      [OFFERED_COURSES, new Set()],
      // Duplicate sections, one without the prerequisite string.
      [
        [
          {
            courseCode: 'CSE220',
            courseName: 'Data Structures',
            credits: 3,
            prerequisiteCourses: '',
          },
          {
            courseCode: 'CSE220',
            courseName: 'Data Structures',
            credits: 3,
            prerequisiteCourses: '(CSE111)',
          },
        ],
        new Set(),
      ],
      [[], new Set()],
    ],
  },

  'planner-core': {
    getCompletedCodes: [[SEMESTERS], [[]]],
    getScheduledCodes: [[SEMESTERS], [[]]],
    getInProgressCodes: [[SEMESTERS], [[]]],
    checkPrereqs: [
      ['CSE221', SEMESTERS, []],
      ['CSE110', [], []],
    ],
    isRelevantToDept: [
      ['CSE220', 'CSE'],
      ['BUS101', 'CSE'],
    ],
    validatePlan: [[['CSE220', 'CSE221']], [[]]],
  },

  routineExport: {
    defaultHueForSection: [['CSE220'], ['MAT120'], ['']],
    buildExportPlan: [[[]], [[SECTION, SECTION_B]]],
  },

  routineFaculty: {
    formatRatingScore: [[4.25], [0], [null], [3]],
    ratingTier: [
      [4.6, 12],
      [3.0, 1],
      [null, 0],
    ],
    buildFacultyRatingMap: [[[]], [[{ facultyInitials: 'ABC', overall: 4.2, count: 9 }]]],
  },

  routineGrid: {
    computeGridLayout: [[[]], [[SECTION]], [[SECTION, SECTION_B, CLASHING]]],
  },

  routinePlannerImport: {
    summarizePlanImport: [[[]], [['CSE220', 'CSE221']]],
    resolvePlanImport: [
      [['CSE220'], FEED],
      [[], FEED],
    ],
  },

  routineState: {
    emptyRoutineState: [[]],
    encodeRoutinePicks: [[{}], [{ CSE220: 101 }]],
    decodeRoutinePicks: [[''], ['CSE220:101'], [null]],
    pickedCourseCodes: [[{ CSE220: 101 }], [{}]],
    buildClashMap: [[FEED], [[]]],
    selectedSections: [
      [{ CSE220: 101 }, FEED],
      [{}, FEED],
    ],
  },

  routineSuggestions: {
    scoreCombination: [
      [[SECTION], {}],
      [[SECTION, SECTION_B], {}],
    ],
    suggestCombinations: [
      [FEED, {}],
      [[], {}],
    ],
  },

  seatStatus: {
    seatInfo: [[SECTION], [SECTION_B], [{ capacity: 0, consumedSeat: 0 }], [null]],
    sortSections: [[FEED], [[]]],
    courseSeatSummary: [[FEED], [[]]],
    searchCourseSections: [
      [FEED, 'CSE220'],
      [FEED, ''],
    ],
  },

  seatWatch: {
    // makeWatch/addWatch stamp `addedAt` from an injectable clock that defaults
    // to Date.now(). Pass one explicitly: letting it default makes the two
    // calls disagree whenever they straddle a millisecond — a flake, not drift.
    // Injecting beats projecting it away, because the field stays asserted.
    makeWatch: [
      [SECTION, FIXED_NOW],
      [SECTION_B, FIXED_NOW],
      [null, FIXED_NOW],
    ],
    hasSeat: [[SECTION], [SECTION_B]],
    indexBySectionId: [[FEED], [[]]],
    parseWatches: [['[]'], ['not json'], [null], ['[{"sectionId":101}]']],
    serializeWatches: [[[]], [[{ sectionId: 101, courseCode: 'CSE220' }]]],
    isWatched: [
      [[{ sectionId: 101 }], 101],
      [[], 101],
    ],
    addWatch: [
      [[], { sectionId: 101, courseCode: 'CSE220' }, FIXED_NOW],
      [[{ sectionId: 101 }], { sectionId: 101 }, FIXED_NOW],
    ],
    removeWatch: [
      [[{ sectionId: 101 }], 101],
      [[], 101],
    ],
    evaluateWatches: [
      [[{ sectionId: 101, consumedSeat: 30, capacity: 30 }], FEED],
      [[], FEED],
    ],
  },

  semesterBriefing: {
    formatClock: [[0], [90], [755], [1439]],
    formatDuration: [[0], [45], [125]],
    parseRoomFloor: [['09A-20C'], ['UB40101'], [''], [null]],
    collectRoutineSlots: [[[]], [[SECTION, SECTION_B]]],
  },

  'transcript-core': {
    normalizeTranscriptLine: [['  CSE110   Programming  '], [''], ['A+ (RT)']],
    normalizeTranscriptText: [[TRANSCRIPT], ['']],
    parseSemesterName: [['Fall 2024'], ['Summer 2025'], ['nonsense']],
    detectDepartment: [[TRANSCRIPT], ['']],
    detectStudentIdentity: [[TRANSCRIPT], ['']],
    parseTranscriptText: [[TRANSCRIPT], ['']],
    parseBlobFallback: [[TRANSCRIPT], ['']],
  },
};
