// src/features/quest/content/solutions.ts
//
// Every zone's reference solutions, keyed by quest id (#981). The app never
// imports this file, so solutions are not in what a student downloads; the
// tests and `npm run quest:check` do. When a zone gets a `*.solutions.ts`
// file, spread it in here.

import { bridgeSolutions } from './zones/bridge.solutions.ts';

export const SOLUTIONS: Readonly<Record<string, string>> = {
  ...bridgeSolutions,
};
