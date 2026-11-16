# Writing content for Shohoj Quest

Zones and quests are data. Adding one never means touching the engine: you edit
a file under `content/`, run the tests, and it is in the game.

The schema is `content/schema.ts`. It is strict, so a misspelt key or a test
that does not match its method fails `npm run test:unit` with the path to the
problem. The six quests in `content/zones/bridge.ts` are worked examples, one of
each kind. Copy the nearest one.

## Add a quest

1. Open the zone's file, for example `content/zones/bridge.ts`.
2. Add an object to `quests`. Where you put it is the order students meet it,
   and a quest can only list quests above it in `requires`.
3. Add its reference solution to the zone's `*.solutions.ts` file under the
   same id. The app never imports that file; the tests do.
4. Run `npm run test:one quest`.

Every quest has these fields:

| Field | What it is |
| --- | --- |
| `id` | Lowercase words with hyphens, unique in the whole world. Progress is saved under it, so never rename a published quest. |
| `type` | `predict`, `hero`, `fill`, `fix` or `write`. |
| `title` | Up to 60 characters. |
| `story` | What the quest-giver says, one speech bubble per entry. |
| `task` | The instruction above the editor. |
| `concepts` | Syllabus topics, shown in the quest log. |
| `xp` | Reward. A student's total is recounted from these, so changing one changes everyone's total. |
| `hints` | Optional. Revealed one at a time. |
| `requires` | Optional. Ids of quests that must be done first. |
| `boss` | Optional. `true` on the one quest that opens the zone's exit. |

Then, by type:

**`predict`** — the student types what a snippet prints. No Java runs, so make
it the first quest of a zone: nothing large is downloaded until a code quest
opens.

- `snippet`: the code, shown read-only.
- `answer`: exactly what it prints.
- `explanation`: shown after a correct answer.

**`write`** and **`fix`** — the student edits a whole file. `starter` is what
the editor opens with: a skeleton for `write`, a program with a bug for `fix`.
A `fix` starter should compile; the bug is in what it does.

**`fill`** — `template` is a program with one line that is only `__BLANK__`.
The student types that line. Their answer is placed at the indentation of the
line above.

These three are graded by `grading`, in one of two modes:

```ts
// A full program. The class must be Main. Run once per test.
grading: {
  mode: 'stdio',
  tests: [
    { name: 'Five planks', stdin: '5\n', expected: '15\n' },
    { hidden: true, stdin: '0\n', expected: '0\n', hint: 'What if there are no planks?' },
  ],
}

// One method, called with each test's arguments. The class is Solution
// unless you set className.
grading: {
  mode: 'method',
  method: { name: 'digitSum', params: [{ type: 'int', name: 'n' }], returns: 'int' },
  tests: [
    { args: [1234], expected: 10 },
    { hidden: true, args: [0], expected: 0 },
  ],
}
```

- Output is compared line by line. Spaces at the end of a line and blank lines
  at the end are ignored; everything else counts, including the spaces at the
  start of a pattern's rows.
- A hidden test shows the student that it failed and its `hint`, and nothing
  about its data. Write the hint for the mistake that test exists to catch.
- At least one test must be visible.
- Method types: `int`, `long`, `double`, `boolean`, `char`, `String`, and arrays
  of each. A `double` result is compared with a small tolerance. A `void`
  method is tested with `expectedStdout` instead of `expected`.
- `timeLimitMs` is per test and defaults to 3000. A test that runs longer is
  killed and reported as a probable infinite loop.

**`hero`** — the student's code drives a hero across a board.

```ts
level: {
  grid: ['#########', 'S.*..*.*G', '#########'],
  facing: 'E',
},
goal: { reach: true, collectAll: true },
```

`S` start, `G` goal, `.` walkable, `*` an item, `#` impassable. Rows must be the
same length. The starter declares `Hero hero = new Hero();` and the student can
call:

| Call | Does |
| --- | --- |
| `hero.step()` | Walks one square forward. Walking into `#` ends the run. |
| `hero.turnLeft()`, `hero.turnRight()` | Turns on the spot. |
| `hero.pick()` | Picks up the item on this square. |
| `hero.frontIsClear()` | `true` if the next square can be walked on. |
| `hero.onItem()` | `true` if there is an item here still to pick. |
| `hero.atGoal()` | `true` on `G`. |

`maxActions` (default 200) is how many actions the hero takes before stopping,
tired.

### Source rules

`rules` are checked on the student's text before anything runs. They are how a
loop quest refuses ten pasted lines:

```ts
rules: [
  { kind: 'atMost', token: 'hero.step(', max: 1, message: 'Write hero.step() only once.' },
  { kind: 'requires', anyOf: ['while', 'for'], message: 'This needs a loop.' },
]
```

Comments and strings do not count. The tests check that a starter does not
already pass its own rules.

## Add a zone

1. Create `content/zones/<id>.ts` exporting a `ZoneInput`, and
   `content/zones/<id>.solutions.ts`.
2. In `content/world.ts`, import it and put it in place of that zone's locked
   stub.
3. Set `status: 'open'`, and give it a `map` key and a `giver`.
4. Open with a `predict` quest, and mark one quest `boss: true`.
5. Draw its map (below), save it as `assets/maps/<map>.json`, and add one line
   for it to `assets/maps/index.ts`.

A locked zone needs only `id`, `order`, `name`, `tagline`, `topics` and
`status: 'locked'`. It is listed in the quest log and cannot be entered.

The game opens the first zone whose status is `open`. Walking from one zone to
the next is not built yet: with two open zones, the second is unreachable.

## Draw a zone's map

A map is drawn in [Tiled](https://www.mapeditor.org/) and exported as JSON. The
game reads meaning from layer names and marker names, so a map needs no code.

Set the map up like this:

- Orthogonal, 16 by 16 pixel tiles, not infinite.
- One tileset: `assets/roguelikeSheet_transparent.png`, tile size 16, margin 0,
  spacing 1. Press **Embed in Map** on the Tilesets panel, or the export will
  not carry it.
- Tile Layer Format: CSV. Export as JSON, uncompressed.

Tile layers are drawn in the order they are listed. Their names say what they
are for; only the start of the name matters, so `built` and `built rails` are
both built layers.

| Layer name starts with | What it does |
| --- | --- |
| `blocked` | Never drawn. Any tile on it marks a square nobody can walk on. Use any tile. |
| `built` | Drawn faintly inside a gate that is shut, and fully once it opens: what a quest builds. |
| `barrier` | Drawn only inside a gate that is shut: what a quest removes. |
| `above` | Drawn over the characters: treetops, a lintel. |
| anything else | Always drawn, under the characters. |

Add one object layer named `markers`:

| Marker name | Shape | What it is |
| --- | --- | --- |
| `spawn` | point | Where a new player starts. |
| `giver` | point | Where the quest-giver stands. Nobody walks through that square. |
| `exit` | rectangle | Stepping in finishes the zone. |
| `gate` | rectangle | Squares that are shut until a quest is solved. Give it a custom property `quest` (string) holding the quest's id. |

A gate is how solving a quest changes the place. Its squares cannot be walked
on until its quest is solved, and walking up to one opens that quest. A quest
can have several gates, and a quest with no gate is still offered by the
quest-giver and the quest log. The boss quest needs a gate between the player
and the exit.

Draw the map as it looks when everything is solved, then lay the gates over
the parts that have to be earned.

`npm run test:one questWorld` reads every open zone's map and fails, saying
why, if a gate names a quest that does not exist, if a new player cannot reach
the quest-giver, if the exit cannot be reached with every quest solved, or if
it can be reached without the boss.

The Bridge's map is drawn by `scripts/quest_bridge_map.mjs` instead of by
hand, so that its spans line up with its quest ids. Re-run the script after
changing it; the tests fail if the committed map is stale. Opening
`assets/maps/bridge.json` in Tiled shows how the layers and markers fit
together.

Art is Kenney's "Roguelike/RPG Pack" and "Roguelike Characters", both CC0. To
draw the quest-giver or the hero from a different tile, or to change what the
hero board is drawn with, edit `assets/sprites.ts`.

## Check your work

```bash
npm run test:one quest
```

Validates every zone, checks each quest has a reference solution that gets past
its rules, and runs the grader's and engine's own tests. No Java runs.

```bash
npm run quest:check
```

Runs every reference solution through the real Java engine in a headless
browser, and checks that no code quest is already solved by its starter. It
downloads about 14 MB from CheerpJ's CDN, so it is not part of CI: run it after
writing or changing quests. Add a word to check only matching quests, for
example `npm run quest:check -- bridge-the-toll`.

When you add a zone's solutions file, spread it into `content/solutions.ts`.

## What is saved

A student's save is the ids of the quests they solved, when, and where their
hero stood. It is kept on their device and, when signed in, in Firestore at
`questProgress/{uid}`. XP is not saved: it is recounted from the content every
time.

For an author that means:

- Never rename a published quest's `id`. The save is keyed by it, so a renamed
  quest reads as unsolved for everyone who solved it.
- Never reuse a retired quest's `id` for a different quest. It would arrive
  already solved.
- Changing a quest's `xp`, its `requires` or its place in the list is safe.
- Deleting a quest is safe. Its id stays in old saves and is ignored.

Grading happens in the student's browser. Treat progress as self-study data:
do not attach anything of value to it.
