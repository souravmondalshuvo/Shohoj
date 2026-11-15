// src/features/quest/game/zoneGame.ts
//
// The walkable zone (#981): Phaser draws a Tiled map, the hero walks it by tap
// or by key, and walking up to the quest-giver or to something a quest has not
// built yet tells the page so.
//
// This is the only file that imports Phaser. It is loaded on demand by the
// quest screen, so Phaser's weight (about 1.4 MB before compression) is paid
// by students who open the game and by nobody else.
//
// It draws and it reports. It does not know what a quest is: the rules of the
// place are in world/zoneMap.ts, and what happens when the hero reaches the
// quest-giver is the page's business. That keeps everything a student reads or
// types in the DOM, where a phone keyboard and a screen reader work.
//
// Three things here are shaped by the site's Content-Security-Policy, which
// this feature does not loosen:
//   * Images load as plain <img> elements (`imageLoadType`). Phaser's default
//     fetches them and reads them back through blob: URLs, which img-src
//     forbids.
//   * The map is handed to Phaser as an object, not fetched.
//   * There is no audio, so no media or blob: source is needed.

import * as Phaser from 'phaser';

import {
  CHARACTERS,
  CHARACTERS_SHEET,
  charactersUrl,
  frameOf,
  tilesUrl,
} from '../assets/sprites.ts';
import {
  canWalk,
  findRoute,
  gateAt,
  inRect,
  shutGates,
  walkGrid,
  type Cell,
  type Gate,
  type LayerRole,
  type WalkGrid,
  type ZoneMap,
} from '../world/zoneMap.ts';

/** What the zone needs to know about the student's progress. */
export interface ZoneState {
  readonly completed: ReadonlySet<string>;
  /** Quests that can be started now: they get a marker. */
  readonly open: ReadonlySet<string>;
}

export type ZoneEvent =
  /** The art is loaded and the zone is drawn. */
  | { readonly kind: 'ready' }
  /** The art could not be loaded. */
  | { readonly kind: 'failed' }
  /** The hero walked up to the quest-giver. */
  | { readonly kind: 'giver' }
  /** The hero walked up to something `quest` has not built yet. */
  | { readonly kind: 'gate'; readonly quest: string }
  /** The hero stepped into the zone's exit. */
  | { readonly kind: 'exit' }
  /** The hero stopped walking, here. */
  | { readonly kind: 'moved'; readonly at: Cell };

export interface ZoneGameOptions {
  /** The element the canvas fills. */
  readonly parent: HTMLElement;
  /** The Tiled export, for Phaser to draw. */
  readonly mapJson: object;
  /** The same map, as the rules read it. */
  readonly map: ZoneMap;
  readonly state: ZoneState;
  /** Where the hero starts. `null`, or a square that cannot be stood on, means the spawn point. */
  readonly start: Cell | null;
  readonly onEvent: (event: ZoneEvent) => void;
}

export interface ZoneGame {
  setState(state: ZoneState): void;
  /** While paused the hero ignores input and the game stops redrawing. */
  setPaused(paused: boolean): void;
  destroy(): void;
}

const TILES_KEY = 'quest-tiles';
const CHARACTERS_KEY = 'quest-characters';
const MAP_KEY = 'quest-zone';

/** Milliseconds to walk one square. */
const STEP_MS = 120;
/** How faintly an unbuilt part of the place shows. */
const GHOST_ALPHA = 0.22;
const WATER = '#5ec3d3';
/** At least this many squares are on screen in each direction. */
const MIN_VIEW = { columns: 11, rows: 9 };
const DEPTH = { characters: 50, above: 100, markers: 200 };

type Intent = { readonly kind: 'giver' } | { readonly kind: 'gate'; readonly gate: Gate } | null;

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Arrow keys and WASD, by physical key, as one step on the map. */
const KEY_STEPS: Readonly<Record<string, Cell>> = {
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
};

/** Squares between a square and the nearest square of a rectangle. */
function gapTo(gate: Gate, cell: Cell): number {
  const dx = Math.max(gate.x - cell.x, 0, cell.x - (gate.x + gate.w - 1));
  const dy = Math.max(gate.y - cell.y, 0, cell.y - (gate.y + gate.h - 1));
  return dx + dy;
}

class ZoneScene extends Phaser.Scene {
  private readonly options: ZoneGameOptions;
  private readonly map: ZoneMap;
  private readonly calm: boolean;
  private state: ZoneState;
  private grid: WalkGrid;
  private paused = false;
  private built = false;

  private cell: Cell;
  private route: Cell[] = [];
  private intent: Intent = null;
  private walking = false;
  /** The direction key pressed since the last frame looked, as a step. */
  private pressed: Cell | null = null;

  private hero: Phaser.GameObjects.Sprite | null = null;
  private heroShadow: Phaser.GameObjects.Ellipse | null = null;
  private tap: Phaser.GameObjects.Arc | null = null;
  private layers: { readonly layer: Phaser.Tilemaps.TilemapLayer; readonly role: LayerRole }[] = [];
  private marks = new Map<string, Phaser.GameObjects.Container>();
  private keys: Record<
    'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd',
    Phaser.Input.Keyboard.Key
  > | null = null;

  constructor(options: ZoneGameOptions) {
    super({ key: 'zone' });
    this.options = options;
    this.map = options.map;
    this.state = options.state;
    this.grid = walkGrid(this.map, this.state.completed);
    const start = options.start;
    this.cell = start && canWalk(this.grid, start) ? start : this.map.spawn;
    this.calm =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── Called by the page ────────────────────────────────────────────────────

  setState(state: ZoneState): void {
    this.state = state;
    this.grid = walkGrid(this.map, state.completed);
    if (this.built) this.showState(true);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.route = [];
    this.intent = null;
    this.pressed = null;
    if (!this.built) return;
    const keyboard = this.input.keyboard;
    if (keyboard) {
      // Keys held when a panel opened must not still count as held when it closes.
      keyboard.resetKeys();
      keyboard.enabled = !paused;
    }
    // Nothing moves behind a panel, so stop drawing: a phone's battery matters
    // more than an idle animation nobody can see.
    if (paused) this.game.loop.sleep();
    else this.game.loop.wake();
  }

  // ── Phaser's hooks ────────────────────────────────────────────────────────

  preload(): void {
    this.load.once('loaderror', () => this.options.onEvent({ kind: 'failed' }));
    this.load.image(TILES_KEY, tilesUrl);
    this.load.spritesheet(CHARACTERS_KEY, charactersUrl, {
      frameWidth: 16,
      frameHeight: 16,
      spacing: 1,
    });
    this.cache.tilemap.add(MAP_KEY, {
      format: Phaser.Tilemaps.Formats.TILED_JSON,
      data: this.options.mapJson,
    });
  }

  create(): void {
    const size = this.map.tileSize;
    const tilemap = this.make.tilemap({ key: MAP_KEY });
    const tileset = tilemap.addTilesetImage(
      this.map.tileset.name,
      TILES_KEY,
      size,
      size,
      this.map.tileset.margin,
      this.map.tileset.spacing,
    );
    if (!tileset) {
      this.options.onEvent({ kind: 'failed' });
      return;
    }

    this.map.layers.forEach((described, index) => {
      const layer = tilemap.createLayer(described.name, tileset);
      if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) return;
      layer.setDepth(described.above ? DEPTH.above + index : index);
      this.layers.push({ layer, role: described.role });
    });

    const centre = (cell: Cell) => ({ x: cell.x * size + size / 2, y: cell.y * size + size / 2 });
    const giverAt = centre(this.map.giver);
    this.add
      .ellipse(giverAt.x, giverAt.y + 7, 10, 4, 0x000000, 0.25)
      .setDepth(DEPTH.characters - 2);
    this.add
      .sprite(giverAt.x, giverAt.y, CHARACTERS_KEY, frameOf(CHARACTERS_SHEET, CHARACTERS.giver))
      .setDepth(DEPTH.characters - 1);

    const heroAt = centre(this.cell);
    this.heroShadow = this.add
      .ellipse(heroAt.x, heroAt.y + 7, 10, 4, 0x000000, 0.25)
      .setDepth(DEPTH.characters - 2);
    this.hero = this.add
      .sprite(heroAt.x, heroAt.y, CHARACTERS_KEY, frameOf(CHARACTERS_SHEET, CHARACTERS.hero))
      .setDepth(DEPTH.characters);

    this.tap = this.add
      .circle(0, 0, 5)
      .setStrokeStyle(1, 0xffffff, 0.9)
      .setDepth(DEPTH.markers - 1)
      .setVisible(false);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.width * size, this.map.height * size);
    camera.startFollow(this.hero, true, 0.18, 0.18);
    this.fit();
    camera.centerOn(heroAt.x, heroAt.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      // A drag is not a tap.
      if (this.paused || pointer.getDistance() > 12) return;
      this.walkTo({ x: Math.floor(pointer.worldX / size), y: Math.floor(pointer.worldY / size) });
    });
    const keyboard = this.input.keyboard;
    if (keyboard) {
      // No capture: Phaser must never swallow a key the code editor wants.
      this.keys = keyboard.addKeys('up,down,left,right,w,a,s,d', false) as NonNullable<
        typeof this.keys
      >;
      keyboard.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, (event: KeyboardEvent) => {
        const step = KEY_STEPS[event.code];
        if (step && !event.repeat && !this.paused) this.pressed = step;
      });
      keyboard.enabled = !this.paused;
    }

    this.built = true;
    this.showState(false);
    if (this.paused) this.game.loop.sleep();
    this.options.onEvent({ kind: 'ready' });
  }

  override update(): void {
    if (this.heroShadow && this.hero) this.heroShadow.setPosition(this.hero.x, this.hero.y + 7);
    if (this.paused || this.walking || this.route.length > 0 || !this.keys) return;

    // A direction counts if its key was pressed since the last look, or is
    // held now. The press is taken from the key event itself, not from the
    // key's state: a quick tap can begin and end between two frames on a slow
    // phone, leaving no state to see, and it must still be one step.
    const press = this.pressed;
    this.pressed = null;
    const k = this.keys;
    const heldX = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const heldY = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const step =
      press ?? (heldX !== 0 ? { x: heldX, y: 0 } : heldY !== 0 ? { x: 0, y: heldY } : null);
    if (!step) return;

    const next = { x: this.cell.x + step.x, y: this.cell.y + step.y };
    if (canWalk(this.grid, next)) {
      this.route = [next];
      this.advance();
      return;
    }
    // Walking into the quest-giver, or into something unbuilt, is how a
    // keyboard player says "this one". Only on the press, not while held, so
    // a key leaned on against a wall does not ask again every frame.
    if (!press) return;
    if (sameCell(next, this.map.giver)) {
      this.options.onEvent({ kind: 'giver' });
      return;
    }
    const gate = gateAt(this.map, this.state.completed, next);
    if (gate) this.options.onEvent({ kind: 'gate', quest: gate.quest });
  }

  // ── Walking ───────────────────────────────────────────────────────────────

  private walkTo(target: Cell): void {
    const gate = gateAt(this.map, this.state.completed, target);
    this.intent = sameCell(target, this.map.giver)
      ? { kind: 'giver' }
      : gate
        ? { kind: 'gate', gate }
        : null;
    this.route = [...findRoute(this.grid, this.cell, target).steps];
    this.showTap(target);
    if (!this.walking) this.advance();
  }

  private advance(): void {
    const hero = this.hero;
    const next = this.route.shift();
    // The ground can change under a route: a panel may have closed with a new
    // state. Stop rather than walk onto something that is no longer there.
    if (!hero || !next || !canWalk(this.grid, next)) {
      this.route = [];
      this.arrive();
      return;
    }
    const size = this.map.tileSize;
    if (next.x !== this.cell.x) hero.setFlipX(next.x < this.cell.x);
    this.walking = true;
    this.tweens.add({
      targets: hero,
      x: next.x * size + size / 2,
      y: next.y * size + size / 2,
      duration: STEP_MS,
      onComplete: () => {
        this.cell = next;
        this.walking = false;
        if (this.paused) {
          this.route = [];
          return;
        }
        this.advance();
      },
    });
  }

  private arrive(): void {
    const intent = this.intent;
    this.intent = null;
    this.options.onEvent({ kind: 'moved', at: this.cell });
    if (inRect(this.map.exit, this.cell)) {
      this.options.onEvent({ kind: 'exit' });
    } else if (intent?.kind === 'giver') {
      const giver = this.map.giver;
      if (Math.abs(giver.x - this.cell.x) + Math.abs(giver.y - this.cell.y) === 1)
        this.options.onEvent({ kind: 'giver' });
    } else if (intent?.kind === 'gate' && gapTo(intent.gate, this.cell) === 1) {
      this.options.onEvent({ kind: 'gate', quest: intent.gate.quest });
    }
  }

  private showTap(target: Cell): void {
    const tap = this.tap;
    if (!tap || this.calm) return;
    const size = this.map.tileSize;
    this.tweens.killTweensOf(tap);
    tap
      .setPosition(target.x * size + size / 2, target.y * size + size / 2)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({ targets: tap, alpha: 0, scale: 1.6, duration: 320 });
  }

  // ── Drawing the state ─────────────────────────────────────────────────────

  /** Show what is built and what is not, and mark what can be started. */
  private showState(animate: boolean): void {
    const shut = shutGates(this.map, this.state.completed);
    const isShut = (x: number, y: number) => shut.some((gate) => inRect(gate, { x, y }));
    const fade = animate && !this.calm;

    for (const { layer, role } of this.layers) {
      if (role === 'always') continue;
      layer.forEachTile(
        (tile) => {
          const closed = isShut(tile.x, tile.y);
          // Built layers show faintly where a quest has yet to lay them, so the
          // student can see what the work is for. Barriers are there or not.
          const alpha = role === 'built' ? (closed ? GHOST_ALPHA : 1) : closed ? 1 : 0;
          if (tile.alpha === alpha) return;
          this.tweens.killTweensOf(tile);
          if (fade) this.tweens.add({ targets: tile, alpha, duration: 450 });
          else tile.setAlpha(alpha);
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { isNotEmpty: true },
      );
    }

    const size = this.map.tileSize;
    const wanted = new Map<string, { x: number; y: number }>();
    if (this.state.open.size > 0) {
      wanted.set('giver', {
        x: this.map.giver.x * size + size / 2,
        y: this.map.giver.y * size - 6,
      });
    }
    for (const gate of shut) {
      const key = `gate:${gate.quest}`;
      // One marker per quest: the first gate drawn for it.
      if (!this.state.open.has(gate.quest) || wanted.has(key)) continue;
      wanted.set(key, { x: (gate.x + gate.w / 2) * size, y: (gate.y + gate.h / 2) * size - 4 });
    }
    for (const [key, mark] of this.marks) {
      if (wanted.has(key)) continue;
      this.tweens.killTweensOf(mark);
      mark.destroy();
      this.marks.delete(key);
    }
    for (const [key, at] of wanted) {
      if (!this.marks.has(key)) this.marks.set(key, this.addMark(at.x, at.y));
    }
  }

  /** A small "!" in a bubble: something here can be started. */
  private addMark(x: number, y: number): Phaser.GameObjects.Container {
    const mark = this.add.container(x, y, [
      this.add.rectangle(0, 0, 7, 9, 0x1c2a22),
      this.add.rectangle(0, 0, 5, 7, 0xf5c542),
      this.add.rectangle(0, -1, 1, 3, 0x1c2a22),
      this.add.rectangle(0, 2, 1, 1, 0x1c2a22),
    ]);
    mark.setDepth(DEPTH.markers);
    if (!this.calm) {
      this.tweens.add({
        targets: mark,
        y: y - 2,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    return mark;
  }

  /** Pick a whole-number zoom: pixel art drawn at 2.5x shimmers as it scrolls. */
  private fit(): void {
    const { width, height } = this.scale.gameSize;
    if (width <= 0 || height <= 0) return;
    const size = this.map.tileSize;
    const roomy = Math.floor(
      Math.min(width / (MIN_VIEW.columns * size), height / (MIN_VIEW.rows * size)),
    );
    // Never zoom out so far that the screen is wider than the map.
    const cover = Math.ceil(
      Math.max(width / (this.map.width * size), height / (this.map.height * size)),
    );
    this.cameras.main.setZoom(Math.max(Math.min(Math.max(roomy, 2), 4), cover));
  }
}

export function createZoneGame(options: ZoneGameOptions): ZoneGame {
  const scene = new ZoneScene(options);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    backgroundColor: WATER,
    pixelArt: true,
    roundPixels: true,
    banner: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    loader: { imageLoadType: 'HTMLImageElement' },
    input: { gamepad: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(1, options.parent.clientWidth),
      height: Math.max(1, options.parent.clientHeight),
      autoRound: true,
    },
    scene,
  });
  return {
    setState: (state) => scene.setState(state),
    setPaused: (paused) => scene.setPaused(paused),
    destroy: () => game.destroy(true),
  };
}
