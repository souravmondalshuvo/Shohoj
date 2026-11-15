// src/features/quest/ui/HeroBoard.tsx
//
// The board a "command the hero" quest is played on (#981), and the replay of
// what the student's code made the hero do.
//
// The Java ran to the end before anything here moves: the engine hands back a
// list of what the hero did, and this walks through it one action at a time.
// That is why an infinite loop cannot freeze the board, and why the replay can
// be watched again without running the code again.
//
// Drawn with the same Kenney tiles as the zone, as plain elements: the board is
// a few dozen squares, and a second Phaser scene would cost more than it saves.

import { useEffect, useState, type CSSProperties } from 'react';

import {
  BOARD_TILES,
  CHARACTERS,
  CHARACTERS_SHEET,
  TILES_SHEET,
  TILE_PITCH,
  TILE_SIZE,
  charactersUrl,
  tilesUrl,
  type SheetCell,
} from '../assets/sprites.ts';
import type { HeroLevel } from '../content/schema.ts';
import { heroStart, type Facing, type HeroRun } from '../grader/hero.ts';

/** Screen pixels per tile pixel. */
const SCALE = 2;
const CELL = TILE_SIZE * SCALE;
/** Milliseconds each action is shown for. */
const FRAME_MS = 230;

function sprite(
  url: string,
  sheet: { readonly width: number; readonly height: number },
  cell: SheetCell,
): CSSProperties {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${sheet.width * SCALE}px ${sheet.height * SCALE}px`,
    backgroundPosition: `-${cell.column * TILE_PITCH * SCALE}px -${cell.row * TILE_PITCH * SCALE}px`,
  };
}

const at = (x: number, y: number): CSSProperties => ({ left: x * CELL, top: y * CELL });

const TURN: Readonly<Record<Facing, string>> = { N: 'up', E: 'right', S: 'down', W: 'left' };

export interface HeroBoardProps {
  readonly level: HeroLevel;
  /** The run to replay, or `null` to show the board as it starts. */
  readonly run: HeroRun | null;
}

export function HeroBoard({ level, run }: HeroBoardProps) {
  // How many of the run's actions have been shown.
  const [shown, setShown] = useState(0);
  // Bumped by "Watch again" to restart the replay of the same run.
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (!run) return undefined;
    const total = run.frames.length;
    const calm =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Each state change happens in a timer, never in the effect body itself.
    let count = calm ? total : 0;
    const first = window.setTimeout(() => setShown(count), 0);
    if (calm || total === 0) return () => window.clearTimeout(first);
    const timer = window.setInterval(() => {
      count += 1;
      setShown(count);
      if (count >= total) window.clearInterval(timer);
    }, FRAME_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [run, replay]);

  const rows = level.grid;
  const columns = rows[0]?.length ?? 0;
  const frames = run ? run.frames.slice(0, Math.min(shown, run.frames.length)) : [];
  const last = frames[frames.length - 1];
  const start = run?.start ?? heroStart(level);
  const hero = last ?? start;

  const taken = new Set<string>();
  for (const frame of frames) if (frame.event === 'pick') taken.add(`${frame.x},${frame.y}`);

  const total = rows.join('').split('*').length - 1;
  const canReplay = run !== null && run.frames.length > 0 && shown >= run.frames.length;
  const bumped = last?.event === 'blocked';

  return (
    <div className="quest-board-wrap">
      <div
        className="quest-board"
        role="img"
        aria-label={`The hero's board, ${columns} squares by ${rows.length}. The hero is at column ${hero.x + 1}, row ${hero.y + 1}, facing ${TURN[hero.facing]}, holding ${taken.size} of ${total}.`}
        style={{ width: columns * CELL, height: rows.length * CELL }}
      >
        {rows.flatMap((row, y) =>
          [...row].map((square, x) => (
            <span
              key={`${x},${y}`}
              className="quest-board-tile"
              style={{
                ...at(x, y),
                ...sprite(
                  tilesUrl,
                  TILES_SHEET,
                  square === '#' ? BOARD_TILES.wall : BOARD_TILES.floor,
                ),
              }}
            />
          )),
        )}
        {rows.flatMap((row, y) =>
          [...row].flatMap((square, x) => {
            if (square === 'G') {
              return [
                <span
                  key={`goal ${x},${y}`}
                  className="quest-board-tile"
                  style={{ ...at(x, y), ...sprite(tilesUrl, TILES_SHEET, BOARD_TILES.goal) }}
                />,
              ];
            }
            if (square === '*' && !taken.has(`${x},${y}`)) {
              return [
                <span
                  key={`item ${x},${y}`}
                  className="quest-board-tile"
                  style={{ ...at(x, y), ...sprite(tilesUrl, TILES_SHEET, BOARD_TILES.item) }}
                />,
              ];
            }
            return [];
          }),
        )}
        <span
          className={`quest-board-hero${bumped ? ' quest-board-hero--bumped' : ''}`}
          data-facing={hero.facing}
          style={{
            transform: `translate(${hero.x * CELL}px, ${hero.y * CELL}px)`,
            ...sprite(charactersUrl, CHARACTERS_SHEET, CHARACTERS.hero),
          }}
        />
      </div>
      <p className="quest-board-caption">
        Holding {taken.size} of {total}
        {canReplay ? (
          <>
            {' · '}
            <button type="button" className="quest-link" onClick={() => setReplay((n) => n + 1)}>
              Watch again
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
