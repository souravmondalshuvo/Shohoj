// src/features/quest/assets/maps/index.ts
//
// Where each zone's Tiled map is (#981), by the `map` key in its zone file.
//
// Each map is its own chunk, fetched when its zone is entered, so a world of
// eight zones does not make the first one slower to open. Adding a zone's map
// is one line here.

export const ZONE_MAPS: Readonly<Record<string, () => Promise<object>>> = {
  bridge: () => import('./bridge.json').then((module) => module.default),
};
