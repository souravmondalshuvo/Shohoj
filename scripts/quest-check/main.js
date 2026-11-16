// scripts/quest-check/main.js
//
// The page scripts/quest_check.mjs drives. It wires the real engine exactly as
// the game does (createJavaEngine, attemptQuest) and exposes it to the script,
// so what the check exercises is the shipped code path, sandbox included.

import { findQuest, loadWorld } from '../../src/features/quest/content/world.ts';
import { attemptQuest } from '../../src/features/quest/runner/attempt.ts';
import { createJavaEngine } from '../../src/features/quest/runner/createEngine.ts';

// The engine runs in the sandbox, as it does in the game. The script that
// drives this page serves the sandbox and passes its address in.
const sandboxUrl = new URLSearchParams(globalThis.location.search).get('sandbox');
if (!sandboxUrl) throw new Error('quest-check needs ?sandbox=<address of the Java sandbox>');

const world = loadWorld();
const engine = createJavaEngine(sandboxUrl);
const statuses = [];
engine.subscribe((status) => statuses.push(status));

globalThis.questCheck = {
  statuses,
  load: () => engine.load(),
  attempt: (questId, answer) => attemptQuest(engine, findQuest(world, questId), answer),
  resources: () => engine.runtimeResources(),
};
