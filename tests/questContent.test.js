// tests/questContent.test.js — the Shohoj Quest content schema and the content
// that ships (#981). The schema half pins what a quest file may say; the content
// half is what stops a broken quest from reaching a deploy, because nothing
// else reads every quest before a student does.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLANK,
  DEFAULT_MAX_ACTIONS,
  DEFAULT_TIME_LIMIT_MS,
  parseQuest,
  parseWorld,
  parseZone,
  valueFits,
} from '../src/features/quest/content/schema.ts';
import {
  WORLD_INPUT,
  findQuest,
  findZone,
  loadWorld,
  questState,
  totalXp,
  zoneCleared,
  zonesInOrder,
} from '../src/features/quest/content/world.ts';
import { bridgeSolutions } from '../src/features/quest/content/zones/bridge.solutions.ts';
import { gradePredict } from '../src/features/quest/grader/grade.ts';
import { planRun } from '../src/features/quest/grader/harness.ts';

// ── Builders: the smallest valid thing of each kind ─────────────────────────

const common = (over = {}) => ({
  id: 'q-one',
  title: 'One',
  story: ['Hello.'],
  task: 'Do it.',
  concepts: ['for'],
  xp: 10,
  ...over,
});

const stdio = (tests = [{ stdin: '1\n', expected: '1\n' }]) => ({ mode: 'stdio', tests });

const writeQuest = (over = {}) =>
  common({ type: 'write', starter: 'public class Main {}', grading: stdio(), ...over });

const methodQuest = (tests, method = {}) =>
  common({
    type: 'write',
    starter: 'public class Solution {}',
    grading: {
      mode: 'method',
      method: { name: 'twice', params: [{ type: 'int', name: 'n' }], returns: 'int', ...method },
      tests,
    },
  });

const heroQuest = (over = {}) =>
  common({
    type: 'hero',
    starter: 'public class Main {}',
    level: { grid: ['S..G'], facing: 'E' },
    ...over,
  });

const zoneOf = (quests, over = {}) => ({
  id: 'zone-a',
  order: 1,
  name: 'A',
  tagline: 'A place.',
  topics: ['loops'],
  status: 'open',
  map: 'zone-a',
  giver: { name: 'Someone' },
  quests,
  ...over,
});

const issues = (result) => {
  assert.equal(result.ok, false, 'expected the content to be rejected');
  return result.error.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
};

// ── Schema: defaults ────────────────────────────────────────────────────────

test('a quest gets its defaults filled in', () => {
  const parsed = parseQuest(writeQuest());
  assert.equal(parsed.ok, true);
  const quest = parsed.value;
  assert.equal(quest.timeLimitMs, DEFAULT_TIME_LIMIT_MS);
  assert.deepEqual(quest.hints, []);
  assert.deepEqual(quest.requires, []);
  assert.deepEqual(quest.rules, []);
  assert.equal(quest.boss, false);
  assert.equal(quest.grading.tests[0].hidden, false);
});

test('a method quest defaults to a class called Solution, a hero quest to the standard goal', () => {
  const method = parseQuest(methodQuest([{ args: [2], expected: 4 }]));
  assert.equal(method.value.grading.className, 'Solution');

  const hero = parseQuest(heroQuest());
  assert.deepEqual(hero.value.goal, { reach: true, collectAll: false });
  assert.equal(hero.value.maxActions, DEFAULT_MAX_ACTIONS);
});

// ── Schema: what it refuses ─────────────────────────────────────────────────

test('a misspelt key is an error, not a field that is silently ignored', () => {
  assert.match(issues(parseQuest(writeQuest({ hint: ['typo for hints'] }))), /hint/);
  assert.match(
    issues(parseQuest(writeQuest({ grading: stdio([{ stdin: '', expected: '', hiden: true }]) }))),
    /hiden/,
  );
});

test('a quest id must be lowercase words joined by hyphens', () => {
  assert.match(issues(parseQuest(writeQuest({ id: 'Bridge_One' }))), /lowercase words/);
});

test('every graded quest needs at least one visible test', () => {
  const allHidden = stdio([{ stdin: '', expected: '', hidden: true }]);
  assert.match(issues(parseQuest(writeQuest({ grading: allHidden }))), /at least one test must be visible/);
});

test('a fill template needs exactly one blank line', () => {
  const fill = (template) => common({ type: 'fill', template, grading: stdio() });
  assert.equal(parseQuest(fill(`a\n    ${BLANK}\nb`)).ok, true);
  assert.match(issues(parseQuest(fill('a\nb'))), /found 0/);
  assert.match(issues(parseQuest(fill(`${BLANK}\n${BLANK}`))), /found 2/);
  // The blank must be alone on its line: this one is part of a statement.
  assert.match(issues(parseQuest(fill(`int x = ${BLANK};`))), /found 0/);
});

test('method tests must match the method they call', () => {
  assert.match(issues(parseQuest(methodQuest([{ args: [1, 2], expected: 2 }]))), /expected 1 argument/);
  assert.match(issues(parseQuest(methodQuest([{ args: ['two'], expected: 4 }]))), /not a valid int/);
  assert.match(issues(parseQuest(methodQuest([{ args: [2] }]))), /expected is required/);
  assert.match(issues(parseQuest(methodQuest([{ args: [2], expected: 4.5 }]))), /not a valid int/);
});

test('a void method is tested by what it prints', () => {
  const ok = methodQuest([{ args: [2], expectedStdout: '4\n' }], { returns: 'void' });
  assert.equal(parseQuest(ok).ok, true);
  const noOutput = methodQuest([{ args: [2] }], { returns: 'void' });
  assert.match(issues(parseQuest(noOutput)), /needs expectedStdout/);
  const returnsValue = methodQuest([{ args: [2], expected: 4, expectedStdout: '' }], { returns: 'void' });
  assert.match(issues(parseQuest(returnsValue)), /no return value/);
});

test('valueFits knows each Java type', () => {
  assert.equal(valueFits('int', 5), true);
  assert.equal(valueFits('int', 5.5), false);
  assert.equal(valueFits('int', 3000000000), false); // past Integer.MAX_VALUE
  assert.equal(valueFits('long', 3000000000), true);
  assert.equal(valueFits('double', 5), true);
  assert.equal(valueFits('char', 'a'), true);
  assert.equal(valueFits('char', 'ab'), false);
  assert.equal(valueFits('String', 'ab'), true);
  assert.equal(valueFits('boolean', true), true);
  assert.equal(valueFits('int[]', [1, 2]), true);
  assert.equal(valueFits('int[]', [1, 'x']), false);
  assert.equal(valueFits('int[]', 1), false);
  assert.equal(valueFits('int', [1]), false);
  assert.equal(valueFits('String[]', []), true);
});

test('a hero level must be a rectangle with one start and the goal it asks for', () => {
  const level = (grid, over = {}) => heroQuest({ level: { grid, facing: 'E' }, ...over });
  assert.match(issues(parseQuest(level(['S..G', '..']))), /same length/);
  assert.match(issues(parseQuest(level(['...G']))), /exactly one S/);
  assert.match(issues(parseQuest(level(['S.SG']))), /exactly one S/);
  assert.match(issues(parseQuest(level(['S...']))), /needs a G/);
  assert.match(issues(parseQuest(level(['S.xG']))), /only S, G/);
  assert.match(
    issues(parseQuest(level(['S..G'], { goal: { reach: true, collectAll: true } }))),
    /at least one \*/,
  );
  // No goal square is fine when the quest is only about collecting.
  assert.equal(parseQuest(level(['S.*.'], { goal: { reach: false, collectAll: true } })).ok, true);
});

test('a quest can only require quests listed before it', () => {
  const a = writeQuest({ id: 'a' });
  const b = writeQuest({ id: 'b', requires: ['a'] });
  assert.equal(parseZone(zoneOf([a, b])).ok, true);
  assert.match(issues(parseZone(zoneOf([b, a]))), /listed earlier/);
  assert.match(issues(parseZone(zoneOf([writeQuest({ id: 'a', requires: ['a'] })]))), /cannot require itself/);
  assert.match(issues(parseZone(zoneOf([writeQuest({ id: 'a', requires: ['ghost'] })]))), /listed earlier/);
});

test('a zone has unique quest ids and at most one boss', () => {
  assert.match(issues(parseZone(zoneOf([writeQuest({ id: 'a' }), writeQuest({ id: 'a' })]))), /duplicate quest id/);
  const bosses = [writeQuest({ id: 'a', boss: true }), writeQuest({ id: 'b', boss: true })];
  assert.match(issues(parseZone(zoneOf(bosses))), /at most one boss/);
});

test('an open zone needs a map, a quest-giver and a quest; a locked one needs none', () => {
  const problems = issues(parseZone(zoneOf([], { map: undefined, giver: undefined })));
  assert.match(problems, /needs a map/);
  assert.match(problems, /needs a quest-giver/);
  assert.match(problems, /at least one quest/);
  const locked = { id: 'later', order: 2, name: 'Later', tagline: 'Soon.', topics: ['x'], status: 'locked' };
  assert.equal(parseZone(locked).ok, true);
});

test('zone ids, zone orders and quest ids are unique across the world', () => {
  const a = zoneOf([writeQuest({ id: 'same' })]);
  const b = zoneOf([writeQuest({ id: 'same' })], { id: 'zone-b', order: 2, map: 'zone-b' });
  assert.match(issues(parseWorld({ zones: [a, b] })), /already used in another zone/);
  assert.match(issues(parseWorld({ zones: [a, { ...b, id: 'zone-a', quests: [] }] })), /duplicate zone id/);
  assert.match(issues(parseWorld({ zones: [a, { ...b, order: 1, quests: [writeQuest({ id: 'x' })] }] })), /duplicate zone order/);
});

// ── The content that ships ──────────────────────────────────────────────────

test('the shipped world is valid', () => {
  const parsed = parseWorld(WORLD_INPUT);
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error.message);
});

test('the world map has the eight zones in syllabus order, with only The Bridge open', () => {
  const zones = zonesInOrder(loadWorld());
  assert.deepEqual(
    zones.map((zone) => zone.id),
    ['gate', 'crossroads', 'bridge', 'library', 'storehouse', 'workshop', 'mirror-tower', 'archive'],
  );
  assert.deepEqual(
    zones.filter((zone) => zone.status === 'open').map((zone) => zone.id),
    ['bridge'],
  );
});

test('The Bridge has one quest of each type, and a boss that is a nested-loop pattern', () => {
  const bridge = findZone(loadWorld(), 'bridge');
  const nonBoss = bridge.quests.filter((quest) => !quest.boss);
  assert.deepEqual(nonBoss.map((quest) => quest.type).sort(), ['fill', 'fix', 'hero', 'predict', 'write']);
  const boss = bridge.quests.filter((quest) => quest.boss);
  assert.equal(boss.length, 1);
  assert.ok(boss[0].concepts.includes('nested loops'));
  // Both grading modes have a worked example.
  const modes = new Set(bridge.quests.filter((q) => 'grading' in q).map((q) => q.grading.mode));
  assert.deepEqual([...modes].sort(), ['method', 'stdio']);
});

test('the first quest of a zone needs no Java engine', () => {
  // Nothing large is downloaded until a code quest opens, so a student on
  // mobile data must be able to start with a quest that is graded without it.
  for (const zone of loadWorld().zones) {
    if (zone.status !== 'open') continue;
    assert.equal(zone.quests[0].type, 'predict', `${zone.id} should open with a predict quest`);
    assert.deepEqual(zone.quests[0].requires, []);
  }
});

test('every quest has a reference solution, and it gets past the quest rules', () => {
  const world = loadWorld();
  for (const zone of world.zones) {
    for (const quest of zone.quests) {
      const solution = bridgeSolutions[quest.id];
      assert.equal(typeof solution, 'string', `${quest.id} has no reference solution`);
      if (quest.type === 'predict') {
        assert.equal(gradePredict(quest, solution).passed, true, `${quest.id}: the solution is not the answer`);
      } else {
        const plan = planRun(quest, solution, 'test');
        assert.equal(plan.kind, 'java', `${quest.id}: the reference solution breaks a source rule`);
      }
    }
  }
});

test('the starter code of a loop quest does not already satisfy its rules', () => {
  // If it did, the rule would be decoration: the student could submit unchanged.
  const world = loadWorld();
  for (const id of ['bridge-first-span', 'bridge-plank-strength', 'bridge-keystone']) {
    const quest = findQuest(world, id);
    assert.equal(planRun(quest, quest.starter, 'test').kind, 'rules', `${id}: starter passes its rules`);
  }
});

test('the boss needs the two quests before it, and beating it clears the zone', () => {
  const world = loadWorld();
  const bridge = findZone(world, 'bridge');
  const boss = bridge.quests.find((quest) => quest.boss);

  assert.equal(questState(bridge.quests[0], new Set()), 'open');
  assert.equal(questState(boss, new Set()), 'locked');
  assert.equal(questState(boss, new Set(boss.requires)), 'open');
  assert.equal(questState(boss, new Set([boss.id])), 'done');

  assert.equal(zoneCleared(bridge, new Set(boss.requires)), false);
  assert.equal(zoneCleared(bridge, new Set([boss.id])), true);
});

test('a zone without a boss clears when every quest is done', () => {
  const zone = parseZone(zoneOf([writeQuest({ id: 'a' }), writeQuest({ id: 'b' })])).value;
  assert.equal(zoneCleared(zone, new Set(['a'])), false);
  assert.equal(zoneCleared(zone, new Set(['a', 'b'])), true);
});

test('XP is counted from the content, and ids that no longer exist count for nothing', () => {
  const world = loadWorld();
  const bridge = findZone(world, 'bridge');
  const all = new Set(bridge.quests.map((quest) => quest.id));
  assert.equal(totalXp(world, new Set()), 0);
  assert.equal(totalXp(world, all), 300);
  assert.equal(totalXp(world, new Set(['bridge-count-the-planks', 'a-quest-that-was-removed'])), 20);
});
