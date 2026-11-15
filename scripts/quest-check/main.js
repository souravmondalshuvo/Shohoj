// scripts/quest-check/main.js
//
// The page scripts/quest_check.mjs drives. It wires the real engine exactly as
// the game does (createJavaEngine, attemptQuest) and exposes it to the script,
// so what the check exercises is the shipped code path, worker included.

import { findQuest, loadWorld } from '../../src/features/quest/content/world.ts';
import { attemptQuest } from '../../src/features/quest/runner/attempt.ts';
import { createJavaEngine } from '../../src/features/quest/runner/createEngine.ts';

const world = loadWorld();
const engine = createJavaEngine();
const statuses = [];
engine.subscribe((status) => statuses.push(status));

globalThis.questCheck = {
  statuses,
  load: () => engine.load(),
  attempt: (questId, answer) => attemptQuest(engine, findQuest(world, questId), answer),
  resources: () => engine.runtimeResources(),
};
