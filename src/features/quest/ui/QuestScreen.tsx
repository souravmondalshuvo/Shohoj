// src/features/quest/ui/QuestScreen.tsx
//
// Shohoj Quest's screen (#981): the zone to walk, and over it everything a
// student reads or types — the quest-giver's words, the quest panel, the log.
//
// The split is deliberate. Phaser draws the place and reports where the hero
// walked; it is fetched on demand and knows nothing about quests. The page
// decides what a walk means, holds the progress, and keeps all text in the
// DOM. So the heavy parts arrive only when they are needed:
//
//   this screen         with the route
//   Phaser and the map  as the screen opens
//   CodeMirror          with the first quest that has code to write
//   the Java engine     the same, and only then (about 14 MB, once)
//
// Progress here is self-study data. Grading runs in the student's browser, so
// nothing on this screen may be trusted for anything of value.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';

import { ZONE_MAPS } from '../assets/maps/index.ts';
import type { Quest, Zone } from '../content/schema.ts';
import { findQuest, loadWorld, questState, totalXp, zonesInOrder } from '../content/world.ts';
import type { ZoneEvent, ZoneGame, ZoneState } from '../game/zoneGame.ts';
import {
  completedSet,
  emptyProgress,
  memoryProgressStore,
  withPosition,
  withSolved,
  type Progress,
  type ProgressStore,
} from '../progress/progress.ts';
import { parseZoneMap } from '../world/zoneMap.ts';
import { QuestLog } from './QuestLog.tsx';
import { QuestPanel } from './QuestPanel.tsx';
import { stopJavaEngine } from './javaEngineStore.ts';
import './quest.css';

type View =
  | { readonly kind: 'world' }
  /** The quest-giver is telling a quest's story, one bubble at a time. */
  | { readonly kind: 'talk'; readonly questId: string; readonly line: number }
  /** The quest-giver has something to say that is not a quest. */
  | { readonly kind: 'notice'; readonly text: string }
  | { readonly kind: 'quest'; readonly questId: string }
  | { readonly kind: 'log' }
  | { readonly kind: 'cleared' };

type Stage = 'loading' | 'ready' | 'failed';

// Kept for as long as the page is open, so leaving the game for another tab of
// Shohoj and coming back does not start it over.
const sessionStore = memoryProgressStore();

export interface QuestScreenProps {
  /** Where progress is kept. Defaults to this visit only. */
  readonly store?: ProgressStore;
}

export function QuestScreen({ store = sessionStore }: QuestScreenProps) {
  const world = useMemo(() => loadWorld(), []);
  const zone = useMemo(
    () => zonesInOrder(world).find((place) => place.status === 'open') ?? null,
    [world],
  );
  if (!zone) {
    return (
      <section className="shell-page">
        <h1>Shohoj Quest</h1>
        <p className="shell-muted">No zone is open yet.</p>
      </section>
    );
  }
  return <ZoneScreen zone={zone} store={store} />;
}

function ZoneScreen({ zone, store }: { readonly zone: Zone; readonly store: ProgressStore }) {
  const world = useMemo(() => loadWorld(), []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<View>({ kind: 'world' });
  const [stage, setStage] = useState<Stage>('loading');
  const [attempt, setAttempt] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ZoneGame | null>(null);
  const drafts = useRef(new Map<string, string>());

  // ── Progress ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let current = true;
    store.load().then(
      (saved) => {
        if (current) setProgress(saved && saved.zone === zone.id ? saved : emptyProgress(zone.id));
      },
      () => {
        if (current) setProgress(emptyProgress(zone.id));
      },
    );
    return () => {
      current = false;
    };
  }, [store, zone.id]);

  useEffect(() => {
    if (progress) store.save(progress);
  }, [progress, store]);

  const completed = useMemo(
    () => (progress ? completedSet(progress) : new Set<string>()),
    [progress],
  );
  const zoneState = useMemo<ZoneState>(
    () => ({
      completed,
      open: new Set(
        zone.quests.filter((quest) => questState(quest, completed) === 'open').map((q) => q.id),
      ),
    }),
    [completed, zone],
  );
  const xp = totalXp(world, completed);
  const doneCount = zone.quests.filter((quest) => completed.has(quest.id)).length;
  const giver = zone.giver?.name ?? 'The quest-giver';

  // ── What a walk means ─────────────────────────────────────────────────────

  const offer = useCallback(
    (quest: Quest) => {
      const state = questState(quest, completed);
      if (state === 'locked') {
        const waiting = quest.requires
          .filter((id) => !completed.has(id))
          .map((id) => findQuest(world, id)?.title ?? id);
        setView({
          kind: 'notice',
          text: `Not yet. "${quest.title}" needs you to finish ${waiting.join(' and ')} first.`,
        });
      } else if (state === 'open') {
        setView({ kind: 'talk', questId: quest.id, line: 0 });
      }
    },
    [completed, world],
  );

  const onZoneEvent = useCallback(
    (event: ZoneEvent) => {
      switch (event.kind) {
        case 'ready':
          setStage('ready');
          break;
        case 'failed':
          setStage('failed');
          break;
        case 'moved':
          setProgress((held) => (held ? withPosition(held, event.at) : held));
          break;
        case 'giver': {
          const next = zone.quests.find((quest) => questState(quest, completed) === 'open');
          if (next) offer(next);
          else
            setView({
              kind: 'notice',
              text: 'There is nothing left for me to teach you here. The far gate is open: the road north is yours.',
            });
          break;
        }
        case 'gate': {
          const quest = zone.quests.find((candidate) => candidate.id === event.quest);
          if (quest) offer(quest);
          break;
        }
        case 'exit':
          setView({ kind: 'cleared' });
          break;
      }
    },
    [completed, offer, zone],
  );

  // The game is created once and outlives many renders. It reads the latest of
  // these through refs, which are written after each render, never during one.
  const latest = useRef({ onZoneEvent, zoneState, paused: view.kind !== 'world', progress });
  useEffect(() => {
    latest.current = { onZoneEvent, zoneState, paused: view.kind !== 'world', progress };
  });

  // ── The game ──────────────────────────────────────────────────────────────

  const loaded = progress !== null;
  useEffect(() => {
    const parent = stageRef.current;
    const loadMap = zone.map ? ZONE_MAPS[zone.map] : undefined;
    if (!loaded || !parent) return undefined;
    let current = true;
    let game: ZoneGame | null = null;

    const start = async () => {
      if (!loadMap) throw new Error(`no map is registered for "${zone.map ?? ''}"`);
      const [{ createZoneGame }, mapJson] = await Promise.all([
        import('../game/zoneGame.ts'),
        loadMap(),
      ]);
      const parsed = parseZoneMap(mapJson);
      if (!parsed.ok) throw new Error(parsed.error.join(' '));
      if (!current) return;
      game = createZoneGame({
        parent,
        mapJson,
        map: parsed.value,
        state: latest.current.zoneState,
        start: latest.current.progress?.at ?? null,
        onEvent: (event) => latest.current.onZoneEvent(event),
      });
      game.setPaused(latest.current.paused);
      gameRef.current = game;
    };
    start().catch(() => {
      if (current) setStage('failed');
    });

    return () => {
      current = false;
      gameRef.current = null;
      game?.destroy();
    };
  }, [loaded, zone.map, attempt]);

  useEffect(() => {
    gameRef.current?.setState(zoneState);
  }, [zoneState]);

  const paused = view.kind !== 'world';
  useEffect(() => {
    gameRef.current?.setPaused(paused);
  }, [paused]);

  // ── The page around it ────────────────────────────────────────────────────

  // The game takes the whole screen, so the page behind must not scroll. And a
  // phone keyboard shrinks what is visible without shrinking the layout: the
  // screen follows the visible part, so Run stays above the keyboard.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('quest-open');
    const viewport = window.visualViewport;
    const fit = () => {
      if (viewport) rootRef.current?.style.setProperty('--quest-height', `${viewport.height}px`);
    };
    fit();
    viewport?.addEventListener('resize', fit);
    return () => {
      html.classList.remove('quest-open');
      viewport?.removeEventListener('resize', fit);
      // Leaving the game frees the JVM's memory. Opening a code quest reloads it.
      stopJavaEngine();
    };
  }, []);

  useEffect(() => {
    if (view.kind === 'world') return undefined;
    const onKey = (event: KeyboardEvent) => {
      // Escape closes what is open — except from inside the code editor, where
      // it is the way out of the Tab key (see CodeEditor.tsx).
      if (event.key !== 'Escape') return;
      if (event.target instanceof Element && event.target.closest('.cm-editor')) return;
      setView({ kind: 'world' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.kind]);

  const toWorld = () => setView({ kind: 'world' });
  const touch = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const openQuest = view.kind === 'quest' ? findQuest(world, view.questId) : null;
  const talkQuest = view.kind === 'talk' ? findQuest(world, view.questId) : null;

  // Drawn straight under <body>: the shell's page card would otherwise decide
  // where "the whole screen" is, and its navigation bar would sit on top.
  return createPortal(
    <div className="quest-root" ref={rootRef}>
      <div className="quest-hud">
        <Link to="/" className="quest-hud-back" aria-label="Leave the game, back to Shohoj">
          ← Shohoj
        </Link>
        <h1 className="quest-hud-title">{zone.name}</h1>
        <span className="quest-hud-xp" aria-label={`${xp} experience points`}>
          {xp} XP
        </span>
        <button
          type="button"
          className="quest-button"
          onClick={() => setView({ kind: 'log' })}
          aria-haspopup="dialog"
        >
          Quests {doneCount}/{zone.quests.length}
        </button>
      </div>

      <div className="quest-stage" ref={stageRef} aria-hidden={paused ? 'true' : undefined}>
        {stage === 'loading' ? <p className="quest-stage-note">Loading {zone.name}…</p> : null}
        {stage === 'failed' ? (
          <div className="quest-stage-note" role="alert">
            <p>The zone could not be loaded. Check your connection.</p>
            <button
              type="button"
              className="quest-button quest-button--primary"
              onClick={() => {
                setStage('loading');
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      {view.kind === 'world' && stage === 'ready' ? (
        <p className="quest-tip">
          {doneCount === 0
            ? `${touch ? 'Tap where you want to walk.' : 'Click where you want to walk, or use the arrow keys.'} ${giver} is waiting by the bridge.`
            : doneCount === zone.quests.length
              ? 'The far gate is open. Take the road north.'
              : 'Walk up to a marked part of the bridge to work on it, or open Quests.'}
        </p>
      ) : null}

      <p className="quest-credit">
        <a href="https://cheerpj.com/" target="_blank" rel="noreferrer">
          Built with CheerpJ
        </a>
        <span> · </span>
        <a href="https://kenney.nl/" target="_blank" rel="noreferrer">
          Art by Kenney
        </a>
      </p>

      {view.kind === 'talk' && talkQuest ? (
        <div className="quest-dialog" role="dialog" aria-label={`${giver} speaks`}>
          <p className="quest-dialog-speaker">{giver}</p>
          <p className="quest-dialog-text" aria-live="polite">
            {talkQuest.story[view.line]}
          </p>
          <div className="quest-dialog-actions">
            <button type="button" className="quest-button" onClick={toWorld}>
              Not now
            </button>
            {view.line < talkQuest.story.length - 1 ? (
              <button
                type="button"
                className="quest-button quest-button--primary"
                autoFocus
                onClick={() => setView({ ...view, line: view.line + 1 })}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="quest-button quest-button--primary"
                autoFocus
                onClick={() => setView({ kind: 'quest', questId: talkQuest.id })}
              >
                Take the quest: {talkQuest.title}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {view.kind === 'notice' ? (
        <div className="quest-dialog" role="dialog" aria-label={`${giver} speaks`}>
          <p className="quest-dialog-speaker">{giver}</p>
          <p className="quest-dialog-text">{view.text}</p>
          <div className="quest-dialog-actions">
            <button
              type="button"
              className="quest-button quest-button--primary"
              autoFocus
              onClick={toWorld}
            >
              All right
            </button>
          </div>
        </div>
      ) : null}

      {view.kind === 'cleared' ? (
        <div className="quest-dialog" role="dialog" aria-label="Zone complete">
          <p className="quest-dialog-speaker">You crossed {zone.name}</p>
          <p className="quest-dialog-text">
            {xp} XP earned. The road goes on, but the next place is not built yet. Every quest here
            can be solved again from the quest log.
          </p>
          <div className="quest-dialog-actions">
            <button
              type="button"
              className="quest-button quest-button--primary"
              autoFocus
              onClick={toWorld}
            >
              Keep exploring
            </button>
          </div>
        </div>
      ) : null}

      {openQuest ? (
        <div className="quest-sheet">
          <QuestPanel
            // A different quest is a different panel: nothing typed carries over.
            key={openQuest.id}
            quest={openQuest}
            alreadySolved={completed.has(openQuest.id)}
            draft={drafts.current.get(openQuest.id)}
            onDraft={(text) => drafts.current.set(openQuest.id, text)}
            onSolved={() =>
              setProgress((held) => (held ? withSolved(held, openQuest.id, Date.now()) : held))
            }
            onClose={toWorld}
          />
        </div>
      ) : null}

      {view.kind === 'log' ? (
        <div className="quest-sheet">
          <QuestLog
            world={world}
            zone={zone}
            completed={completed}
            xp={xp}
            onOpen={(questId) => setView({ kind: 'quest', questId })}
            onClose={toWorld}
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
