// src/app/routes/QuestRoute.tsx
//
// Shohoj Quest (#981) — a 2D game where the hero advances only by solving
// CSE110 problems in Java. This file is the route and nothing else: the game is
// src/features/quest, and how to write content for it is CONTENT.md there.
//
// BRACU only: the quests follow BRACU's CSE110 syllabus. The route has no tab;
// it is opened by its address while the first zone is tested with students.

// Progress is kept on the student's device and in Firestore, and unfinished
// code on the device; the stores come from here because they need to know who
// is signed in, which the game itself does not.

import { QuestScreen } from '../../features/quest/ui/QuestScreen';
import { useQuestStores } from '../providers/useQuestStores';

export function Component() {
  const { store, drafts } = useQuestStores();
  return <QuestScreen store={store} drafts={drafts} />;
}
