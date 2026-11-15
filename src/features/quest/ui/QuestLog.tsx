// src/features/quest/ui/QuestLog.tsx
//
// The quest log (#981): every quest in the zone, what it teaches, and whether
// it is done, open or waiting on another.
//
// It is also the way to play without walking. Every open quest can be started
// from here, so the game does not depend on steering a character round a
// canvas, which a screen reader cannot see and some students cannot do.

import { useEffect, useRef } from 'react';

import type { World, Zone } from '../content/schema.ts';
import { questState, zonesInOrder } from '../content/world.ts';

export interface QuestLogProps {
  readonly world: World;
  readonly zone: Zone;
  readonly completed: ReadonlySet<string>;
  readonly xp: number;
  readonly onOpen: (questId: string) => void;
  readonly onClose: () => void;
}

export function QuestLog({ world, zone, completed, xp, onOpen, onClose }: QuestLogProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const titles = new Map(zone.quests.map((quest) => [quest.id, quest.title]));
  const done = zone.quests.filter((quest) => completed.has(quest.id)).length;
  const available = zone.quests.reduce((sum, quest) => sum + quest.xp, 0);

  return (
    <div className="quest-panel" role="dialog" aria-modal="true" aria-labelledby="quest-log-title">
      <div className="quest-panel-head">
        <div>
          <p className="quest-kind">
            {done} of {zone.quests.length} quests · {xp} of {available} XP
          </p>
          <h2 id="quest-log-title" ref={headingRef} tabIndex={-1}>
            Quest log: {zone.name}
          </h2>
        </div>
        <button type="button" className="quest-button" onClick={onClose}>
          Back
        </button>
      </div>

      <div className="quest-panel-body">
        <ol className="quest-log">
          {zone.quests.map((quest) => {
            const state = questState(quest, completed);
            const waiting = quest.requires
              .filter((id) => !completed.has(id))
              .map((id) => titles.get(id) ?? id);
            return (
              <li key={quest.id} className={`quest-log-item quest-log-item--${state}`}>
                <div className="quest-log-text">
                  <p className="quest-log-title">
                    {quest.title}
                    {quest.boss ? <span className="quest-chip quest-chip--boss">Boss</span> : null}
                  </p>
                  <p className="quest-log-meta">
                    {quest.concepts.join(' · ')} · {quest.xp} XP
                  </p>
                  {state === 'locked' ? (
                    <p className="quest-log-meta">Needs: {waiting.join(', ')}</p>
                  ) : null}
                </div>
                {state === 'locked' ? (
                  <span className="quest-log-state">Locked</span>
                ) : (
                  <button
                    type="button"
                    className={`quest-button${state === 'open' ? ' quest-button--primary' : ''}`}
                    onClick={() => onOpen(quest.id)}
                    aria-label={`${state === 'done' ? 'Practise' : 'Start'} ${quest.title}`}
                  >
                    {state === 'done' ? 'Done ✓' : 'Start'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        <h3 className="quest-subhead">The world</h3>
        <ul className="quest-zones">
          {zonesInOrder(world).map((place) => (
            <li
              key={place.id}
              className={`quest-zone${place.id === zone.id ? ' quest-zone--here' : ''}`}
            >
              <span className="quest-zone-name">
                {place.order}. {place.name}
              </span>
              <span className="quest-zone-note">
                {place.id === zone.id
                  ? 'You are here'
                  : place.status === 'open'
                    ? place.tagline
                    : 'Not built yet'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
