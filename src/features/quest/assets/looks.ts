// src/features/quest/assets/looks.ts
//
// The people Shohoj Quest can draw (#981), as layers of Kenney's "Roguelike
// Characters" sheet (CC0). Kept apart from sprites.ts, which imports the sheet
// images, so the map rules and their Node tests can check a map's people by
// name without loading a picture.

/** A tile's place on a sheet: column and row, from 0. */
export interface SheetCell {
  readonly column: number;
  readonly row: number;
}

/**
 * A person, as layers of the characters sheet drawn bottom to top: body,
 * trousers, shoes, shirt, hair, hat. The sheet is a paper doll, so a handful
 * of layers makes someone who belongs to the place rather than a stock hero.
 */
export type Look = readonly SheetCell[];

const c = (column: number, row: number): SheetCell => ({ column, row });

/**
 * The people a zone can show. A map's `scenery` layer names them by key
 * (CONTENT.md); the hero and the quest-giver are always these two.
 */
export const LOOKS = {
  /** The student: short dark hair, a Shohoj-green shirt. */
  hero: [c(0, 1), c(3, 0), c(4, 0), c(7, 5), c(23, 4)],
  /** Karim Majhi, the boatman: a khaki vest, white beard, a straw hat. */
  boatman: [c(1, 2), c(3, 3), c(7, 4), c(21, 8), c(28, 8)],
  /** Sells rice and fruit at the ghat. */
  seller: [c(1, 1), c(3, 2), c(6, 8), c(22, 6)],
  /** Fishes off the jetty, in a green hat. */
  fisher: [c(0, 2), c(3, 3), c(8, 9), c(29, 8)],
  /** Works the paddy, under a straw hat. */
  farmer: [c(0, 2), c(3, 0), c(4, 1), c(10, 10), c(23, 5), c(28, 8)],
  /** In an orange sari-like wrap, long braid. */
  villager: [c(0, 1), c(3, 5), c(6, 0), c(24, 5)],
} as const satisfies Record<string, Look>;

export type LookName = keyof typeof LOOKS;

export const isLookName = (name: string): name is LookName =>
  Object.prototype.hasOwnProperty.call(LOOKS, name);
