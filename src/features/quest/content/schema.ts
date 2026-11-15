// src/features/quest/content/schema.ts
//
// The content schema for Shohoj Quest (#981): what a zone and a quest are, as
// data. The engine reads only what this file describes, so a new quest is a new
// object in a zone file and never a change to engine code.
//
// Every object is strict: a misspelt key is an error rather than a field that
// is silently ignored, because the person writing quest two hundred will not be
// reading the engine to find out why a hint never shows.
//
// Authors write the *input* types (`ZoneInput`, `QuestInput`), where defaults
// may be left out. The engine reads the parsed types (`Zone`, `Quest`), where
// every default has been filled in. See src/features/quest/CONTENT.md.
//
// Pure: no React, Phaser, Firebase or DOM, so the unit tests load it in Node.

import { validate, z, type SchemaValidationError } from '../../../shared/validation/schema.ts';
import type { Result } from '../../../core/result.ts';

/** The line a `fill` quest's template leaves for the student, alone on its row. */
export const BLANK = '__BLANK__';

/** Per-test time limit when a quest does not set one. */
export const DEFAULT_TIME_LIMIT_MS = 3000;

/** Hero actions allowed in one run when a quest does not set a number. */
export const DEFAULT_MAX_ACTIONS = 200;

const slug = z
  .string()
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase words joined by hyphens');
const javaIdentifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'not a Java identifier');
const prose = z.string().min(1);
const code = z.string().min(1);

// ── Java values, for method-call tests ──────────────────────────────────────

/** Parameter and return types a method quest can use. */
export const JAVA_TYPES = [
  'int',
  'long',
  'double',
  'boolean',
  'char',
  'String',
  'int[]',
  'long[]',
  'double[]',
  'boolean[]',
  'char[]',
  'String[]',
] as const;
export type JavaType = (typeof JAVA_TYPES)[number];

const javaType = z.enum(JAVA_TYPES);
const scalar = z.union([z.number(), z.boolean(), z.string()]);
const javaValue = z.union([scalar, z.array(scalar)]);
export type JavaScalar = z.infer<typeof scalar>;
export type JavaValue = z.infer<typeof javaValue>;

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

function scalarFits(type: string, value: JavaScalar): boolean {
  switch (type) {
    case 'int':
      return (
        typeof value === 'number' && Number.isInteger(value) && value >= INT_MIN && value <= INT_MAX
      );
    case 'long':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'double':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'char':
      return typeof value === 'string' && value.length === 1;
    case 'String':
      return typeof value === 'string';
    default:
      return false;
  }
}

/** Whether a value written in a quest file can stand for a Java value of `type`. */
export function valueFits(type: JavaType, value: JavaValue): boolean {
  if (type.endsWith('[]')) {
    const element = type.slice(0, -2);
    return Array.isArray(value) && value.every((item) => scalarFits(element, item));
  }
  return !Array.isArray(value) && scalarFits(type, value);
}

// ── Grading ─────────────────────────────────────────────────────────────────

/**
 * A rule about the source text itself, checked before anything is compiled.
 * It is how a quest about loops refuses ten copies of `hero.step();`.
 */
const sourceRule = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('requires'),
    /** At least one of these must appear. Whole words for names (`while`). */
    anyOf: z.array(z.string().min(1)).min(1),
    /** Shown to the student when the rule fails. */
    message: prose,
  }),
  z.strictObject({
    kind: z.literal('atMost'),
    /** Counted outside comments and string literals, ignoring whitespace. */
    token: z.string().min(1),
    /** `0` forbids the token outright. */
    max: z.number().int().min(0),
    message: prose,
  }),
]);
export type SourceRule = z.infer<typeof sourceRule>;

const testCommon = {
  /** A label for the test list. Defaults to "Test 1", "Test 2", … */
  name: z.string().min(1).optional(),
  /** Hidden tests report pass or fail and nothing about their data. */
  hidden: z.boolean().default(false),
  /** Shown when this test fails. The only thing a hidden test may reveal. */
  hint: z.string().min(1).optional(),
};

const stdioTest = z.strictObject({
  ...testCommon,
  /** What the program reads from `System.in`. */
  stdin: z.string().default(''),
  /** What it must print. Trailing spaces and trailing blank lines are ignored. */
  expected: z.string(),
});

const methodTest = z.strictObject({
  ...testCommon,
  /** One value per parameter, in order. */
  args: z.array(javaValue),
  /** The return value. Required unless the method returns `void`. */
  expected: javaValue.optional(),
  /** What the method must print. Required for `void`, optional otherwise. */
  expectedStdout: z.string().optional(),
});

/** A full program with `public class Main`, run once per test. */
const stdioGrading = z.strictObject({
  mode: z.literal('stdio'),
  tests: z.array(stdioTest).min(1),
});

/** One method, called directly with each test's arguments. */
const methodGrading = z.strictObject({
  mode: z.literal('method'),
  /** The class the student's file declares. */
  className: javaIdentifier.default('Solution'),
  method: z.strictObject({
    name: javaIdentifier,
    params: z.array(z.strictObject({ type: javaType, name: javaIdentifier })),
    returns: z.union([javaType, z.literal('void')]),
  }),
  tests: z.array(methodTest).min(1),
});

const grading = z.discriminatedUnion('mode', [stdioGrading, methodGrading]);
export type Grading = z.infer<typeof grading>;
export type StdioGrading = z.infer<typeof stdioGrading>;
export type MethodGrading = z.infer<typeof methodGrading>;

// ── Quests ──────────────────────────────────────────────────────────────────

const questCommon = {
  /** Unique across the whole world: progress is saved under this id. */
  id: slug,
  title: z.string().min(1).max(60),
  /** What the quest-giver says, one speech bubble per entry. */
  story: z.array(prose).min(1),
  /** The instruction shown above the editor. */
  task: prose,
  /** Syllabus topics, for the quest log and for revision filters later. */
  concepts: z.array(z.string().min(1)).min(1),
  xp: z.number().int().min(0).max(1000),
  /** Revealed one at a time, on request. */
  hints: z.array(prose).default([]),
  /** Quests that must be complete first. Each must be listed earlier in the zone. */
  requires: z.array(slug).default([]),
  /** The quest that opens the zone's exit. At most one per zone. */
  boss: z.boolean().default(false),
};

const javaQuestCommon = {
  ...questCommon,
  grading,
  rules: z.array(sourceRule).default([]),
  /** Per test. A run that exceeds it is killed and reported as a timeout. */
  timeLimitMs: z.number().int().min(500).max(10000).default(DEFAULT_TIME_LIMIT_MS),
};

const writeQuest = z.strictObject({
  ...javaQuestCommon,
  type: z.literal('write'),
  /** What the editor opens with. */
  starter: code,
});

const fixQuest = z.strictObject({
  ...javaQuestCommon,
  type: z.literal('fix'),
  /** The broken program. It should compile: the bug is in what it does. */
  starter: code,
});

const fillQuest = z.strictObject({
  ...javaQuestCommon,
  type: z.literal('fill'),
  /** A program with exactly one line that is only `__BLANK__`. */
  template: code,
});

const predictQuest = z.strictObject({
  ...questCommon,
  type: z.literal('predict'),
  /** Shown read-only. The student types what it prints. */
  snippet: code,
  /** The exact output. Compared the way a program's output is. */
  answer: z.string().min(1),
  /** Shown after a correct answer: why it prints that. */
  explanation: prose,
});

const heroLevel = z.strictObject({
  /**
   * The board, one string per row, all the same length.
   * `S` start, `G` goal, `.` walkable, `*` an item to pick, `#` impassable.
   */
  grid: z.array(z.string().min(1)).min(1),
  /** The way the hero faces at the start. */
  facing: z.enum(['N', 'E', 'S', 'W']),
});
export type HeroLevel = z.infer<typeof heroLevel>;

const heroQuest = z.strictObject({
  ...questCommon,
  type: z.literal('hero'),
  starter: code,
  level: heroLevel,
  goal: z
    .strictObject({
      /** The hero must finish standing on `G`. */
      reach: z.boolean().default(true),
      /** Every `*` must have been picked. */
      collectAll: z.boolean().default(false),
    })
    .default({ reach: true, collectAll: false }),
  /** The hero stops, tired, after this many actions. */
  maxActions: z.number().int().min(1).max(2000).default(DEFAULT_MAX_ACTIONS),
  rules: z.array(sourceRule).default([]),
  timeLimitMs: z.number().int().min(500).max(10000).default(DEFAULT_TIME_LIMIT_MS),
});

type Issue = (message: string, path: (string | number)[]) => void;

function checkMethodGrading(g: MethodGrading, issue: Issue): void {
  const { params, returns } = g.method;
  g.tests.forEach((test, t) => {
    const at = ['grading', 'tests', t];
    if (test.args.length !== params.length) {
      issue(`expected ${params.length} argument(s), got ${test.args.length}`, [...at, 'args']);
    }
    test.args.forEach((arg, a) => {
      const param = params[a];
      if (param && !valueFits(param.type, arg)) {
        issue(`argument ${a + 1} is not a valid ${param.type}`, [...at, 'args', a]);
      }
    });
    if (returns === 'void') {
      if (test.expected !== undefined)
        issue('a void method has no return value to expect', [...at, 'expected']);
      if (test.expectedStdout === undefined) {
        issue('a void method needs expectedStdout', [...at, 'expectedStdout']);
      }
    } else if (test.expected === undefined) {
      issue(`expected is required for a method returning ${returns}`, [...at, 'expected']);
    } else if (!valueFits(returns, test.expected)) {
      issue(`expected is not a valid ${returns}`, [...at, 'expected']);
    }
  });
}

function checkHeroLevel(level: HeroLevel, reach: boolean, issue: Issue): void {
  const width = level.grid[0]?.length ?? 0;
  const count = (ch: string) => level.grid.join('').split(ch).length - 1;
  level.grid.forEach((row, r) => {
    if (row.length !== width) issue('every row must be the same length', ['level', 'grid', r]);
    if (/[^SG.*#]/.test(row)) issue('only S, G, ., * and # are allowed', ['level', 'grid', r]);
  });
  if (count('S') !== 1) issue('the grid needs exactly one S', ['level', 'grid']);
  if (count('G') > 1) issue('the grid can have at most one G', ['level', 'grid']);
  if (reach && count('G') !== 1) issue('goal.reach needs a G on the grid', ['level', 'grid']);
}

const quest = z
  .discriminatedUnion('type', [writeQuest, fixQuest, fillQuest, predictQuest, heroQuest])
  .superRefine((q, ctx) => {
    const issue: Issue = (message, path) => ctx.addIssue({ code: 'custom', message, path });
    if (q.requires.includes(q.id)) issue('a quest cannot require itself', ['requires']);
    if (q.type === 'predict') return;
    if (q.type === 'hero') {
      checkHeroLevel(q.level, q.goal.reach, issue);
      if (q.goal.collectAll && !q.level.grid.some((row) => row.includes('*'))) {
        issue('goal.collectAll needs at least one * on the grid', ['goal', 'collectAll']);
      }
      return;
    }
    if (q.type === 'fill') {
      const blanks = q.template.split('\n').filter((line) => line.trim() === BLANK).length;
      if (blanks !== 1) {
        issue(`the template needs exactly one line that is only ${BLANK}, found ${blanks}`, [
          'template',
        ]);
      }
    }
    if (!q.grading.tests.some((test) => !test.hidden)) {
      issue('at least one test must be visible, so the student can see what is asked', [
        'grading',
        'tests',
      ]);
    }
    if (q.grading.mode === 'method') checkMethodGrading(q.grading, issue);
  });

export type Quest = z.infer<typeof quest>;
export type QuestInput = z.input<typeof quest>;
export type QuestType = Quest['type'];
export type JavaQuest = Extract<Quest, { type: 'write' | 'fix' | 'fill' }>;
export type HeroQuest = Extract<Quest, { type: 'hero' }>;
export type PredictQuest = Extract<Quest, { type: 'predict' }>;

// ── Zones and the world ─────────────────────────────────────────────────────

const zone = z
  .strictObject({
    id: slug,
    /** Position on the world map, from 1. */
    order: z.number().int().min(1),
    name: z.string().min(1).max(40),
    /** One line under the name on the world map. */
    tagline: prose,
    /** Syllabus topics the zone covers. */
    topics: z.array(z.string().min(1)).min(1),
    /** A locked zone is drawn on the world map and cannot be entered. */
    status: z.enum(['open', 'locked']),
    /** The Tiled map's key under assets/maps, without `.json`. Open zones only. */
    map: slug.optional(),
    /** Who hands out the quests. Open zones only. */
    giver: z.strictObject({ name: z.string().min(1).max(40) }).optional(),
    quests: z.array(quest).default([]),
  })
  .superRefine((z0, ctx) => {
    const issue: Issue = (message, path) => ctx.addIssue({ code: 'custom', message, path });
    const seen = new Set<string>();
    z0.quests.forEach((q, i) => {
      if (seen.has(q.id)) issue(`duplicate quest id "${q.id}"`, ['quests', i, 'id']);
      q.requires.forEach((required, r) => {
        // "Listed earlier" is the whole dependency rule. It cannot form a cycle,
        // and it makes the order in the file the order students meet the quests.
        if (required !== q.id && !seen.has(required)) {
          issue(`"${required}" must be a quest listed earlier in this zone`, [
            'quests',
            i,
            'requires',
            r,
          ]);
        }
      });
      seen.add(q.id);
    });
    if (z0.quests.filter((q) => q.boss).length > 1)
      issue('a zone has at most one boss quest', ['quests']);
    if (z0.status === 'open') {
      if (!z0.map) issue('an open zone needs a map', ['map']);
      if (!z0.giver) issue('an open zone needs a quest-giver', ['giver']);
      if (z0.quests.length === 0) issue('an open zone needs at least one quest', ['quests']);
    }
  });

export type Zone = z.infer<typeof zone>;
export type ZoneInput = z.input<typeof zone>;

const world = z.strictObject({ zones: z.array(zone).min(1) }).superRefine((w, ctx) => {
  const issue: Issue = (message, path) => ctx.addIssue({ code: 'custom', message, path });
  const zoneIds = new Set<string>();
  const orders = new Set<number>();
  const questIds = new Set<string>();
  w.zones.forEach((z0, i) => {
    if (zoneIds.has(z0.id)) issue(`duplicate zone id "${z0.id}"`, ['zones', i, 'id']);
    if (orders.has(z0.order)) issue(`duplicate zone order ${z0.order}`, ['zones', i, 'order']);
    zoneIds.add(z0.id);
    orders.add(z0.order);
    z0.quests.forEach((q, j) => {
      if (questIds.has(q.id)) {
        issue(`quest id "${q.id}" is already used in another zone`, [
          'zones',
          i,
          'quests',
          j,
          'id',
        ]);
      }
      questIds.add(q.id);
    });
  });
});

export type World = z.infer<typeof world>;
export type WorldInput = z.input<typeof world>;

/** Validate one quest. Used by the tests and by anything that loads quest data. */
export function parseQuest(input: unknown): Result<Quest, SchemaValidationError> {
  return validate(quest, input, 'quest');
}

/** Validate one zone, including how its quests depend on each other. */
export function parseZone(input: unknown): Result<Zone, SchemaValidationError> {
  return validate(zone, input, 'zone');
}

/** Validate the whole world, including ids that must be unique across zones. */
export function parseWorld(input: unknown): Result<World, SchemaValidationError> {
  return validate(world, input, 'world');
}
