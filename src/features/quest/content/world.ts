// src/features/quest/content/world.ts
//
// The world map for Shohoj Quest (#981): every zone in syllabus order, and the
// lookups the engine uses to find its way around them.
//
// Only The Bridge is open. The other seven are listed so the world map can draw
// them as places still to come; a locked zone needs a name, a tagline and its
// topics, nothing else. Opening one means writing its zone file, importing it
// here, and replacing its stub.

import { parseWorld, type Quest, type World, type WorldInput, type Zone } from './schema.ts';
import { bridge } from './zones/bridge.ts';

export const WORLD_INPUT: WorldInput = {
  zones: [
    {
      id: 'gate',
      order: 1,
      name: 'The Gate',
      tagline: 'Say something, and remember something.',
      topics: ['output', 'variables', 'data types', 'operators', 'Scanner input'],
      status: 'locked',
    },
    {
      id: 'crossroads',
      order: 2,
      name: 'The Crossroads',
      tagline: 'Every path is a condition.',
      topics: ['if/else', 'nested conditions', 'logical operators', 'switch'],
      status: 'locked',
    },
    bridge,
    {
      id: 'library',
      order: 4,
      name: 'The Library',
      tagline: 'Words, one character at a time.',
      topics: ['strings'],
      status: 'locked',
    },
    {
      id: 'storehouse',
      order: 5,
      name: 'The Storehouse',
      tagline: 'Shelves, numbered from zero.',
      topics: ['arrays', 'searching', 'sorting'],
      status: 'locked',
    },
    {
      id: 'workshop',
      order: 6,
      name: 'The Workshop',
      tagline: 'Build a tool once, use it everywhere.',
      topics: ['methods', 'parameters', 'return', 'scope'],
      status: 'locked',
    },
    {
      id: 'mirror-tower',
      order: 7,
      name: 'The Mirror Tower',
      tagline: 'A staircase that climbs itself.',
      topics: ['recursion'],
      status: 'locked',
    },
    {
      id: 'archive',
      order: 8,
      name: 'The Archive',
      tagline: 'What is written down outlives the program.',
      topics: ['file I/O'],
      status: 'locked',
    },
  ],
};

let cached: World | null = null;

/**
 * The validated world. Invalid content is a bug in a data file, not something
 * a student can cause or recover from, so it throws with every problem listed
 * instead of returning a Result nobody could act on. The unit tests load this,
 * which is what keeps a bad quest from reaching a deploy.
 */
export function loadWorld(): World {
  if (cached) return cached;
  const parsed = parseWorld(WORLD_INPUT);
  if (!parsed.ok) throw new Error(`Quest content is invalid: ${parsed.error.message}`);
  cached = parsed.value;
  return cached;
}

/** Zones in map order. */
export function zonesInOrder(world: World): readonly Zone[] {
  return [...world.zones].sort((a, b) => a.order - b.order);
}

export function findZone(world: World, zoneId: string): Zone | null {
  return world.zones.find((zone) => zone.id === zoneId) ?? null;
}

export function findQuest(world: World, questId: string): Quest | null {
  for (const zone of world.zones) {
    const quest = zone.quests.find((q) => q.id === questId);
    if (quest) return quest;
  }
  return null;
}

/** The state of one quest for one student. */
export type QuestState = 'done' | 'open' | 'locked';

/** Whether a quest is finished, ready to be taken, or waiting on others. */
export function questState(quest: Quest, completed: ReadonlySet<string>): QuestState {
  if (completed.has(quest.id)) return 'done';
  return quest.requires.every((id) => completed.has(id)) ? 'open' : 'locked';
}

/**
 * Whether the zone's exit is open. A zone with a boss opens when the boss is
 * beaten; one without opens when every quest is done.
 */
export function zoneCleared(zone: Zone, completed: ReadonlySet<string>): boolean {
  const boss = zone.quests.find((q) => q.boss);
  if (boss) return completed.has(boss.id);
  return zone.quests.length > 0 && zone.quests.every((q) => completed.has(q.id));
}

/**
 * XP for a set of completed quests, counted from the content rather than
 * stored: a quest whose reward changes, or that is removed, is reflected the
 * next time the total is read, and a saved number cannot drift from it.
 */
export function totalXp(world: World, completed: ReadonlySet<string>): number {
  let xp = 0;
  for (const zone of world.zones) {
    for (const quest of zone.quests) {
      if (completed.has(quest.id)) xp += quest.xp;
    }
  }
  return xp;
}
