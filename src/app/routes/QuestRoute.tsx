// src/app/routes/QuestRoute.tsx
//
// Shohoj Quest (#981) — a 2D game where the hero advances only by solving
// CSE110 problems in Java. This file is the route and nothing else: the game is
// src/features/quest, and how to write content for it is CONTENT.md there.
//
// BRACU only: the quests follow BRACU's CSE110 syllabus. The route has no tab;
// it is opened by its address while the first zone is tested with students.

import { QuestScreen } from '../../features/quest/ui/QuestScreen';

export function Component() {
  return <QuestScreen />;
}
