// src/features/quest/assets/sprites.ts
//
// Where the pictures are on Kenney's sheets (#981), for the code that draws
// single tiles: the people in the zone, and the hero board in the quest panel.
// A zone map's tiles do not use this file; a Tiled map carries its own tile
// ids. Its `scenery` layer names people from LOOKS below.
//
// Both sheets are CC0, by Kenney (kenney.nl): "Roguelike/RPG Pack" and
// "Roguelike Characters". They are committed exactly as downloaded, so a zone
// can be drawn in Tiled against the same image. Their licences are beside them.
//
// Tiles are 16 pixels square with 1 pixel between them and none round the edge.

import charactersUrl from './roguelikeChar_transparent.png';
import tilesUrl from './roguelikeSheet_transparent.png';

export { charactersUrl, tilesUrl };
export { LOOKS, isLookName, type Look, type LookName, type SheetCell } from './looks.ts';
import type { SheetCell } from './looks.ts';

export const TILE_SIZE = 16;
/** Distance from one tile's left edge to the next one's. */
export const TILE_PITCH = 17;

export const TILES_SHEET = { columns: 57, rows: 31, width: 968, height: 526 } as const;
export const CHARACTERS_SHEET = { columns: 54, rows: 12, width: 918, height: 203 } as const;

/** A tile's frame number, counting along the rows, as Phaser numbers them. */
export const frameOf = (sheet: { readonly columns: number }, cell: SheetCell): number =>
  cell.row * sheet.columns + cell.column;

/** What the hero board is drawn with. */
export const BOARD_TILES = {
  floor: { column: 8, row: 2 },
  wall: { column: 0, row: 0 },
  item: { column: 17, row: 7 },
  goal: { column: 20, row: 0 },
} as const satisfies Record<string, SheetCell>;
