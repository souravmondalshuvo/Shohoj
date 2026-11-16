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

// The Java engine runs in a page on the Worker's origin, not this one; its
// address comes from here too, because it is part of the runtime config.

import { QuestScreen } from '../../features/quest/ui/QuestScreen';
import { useQuestSandboxUrl, useQuestStores } from '../providers/useQuestStores';

export function Component() {
  const { store, drafts } = useQuestStores();
  const javaSandboxUrl = useQuestSandboxUrl();
  return <QuestScreen store={store} drafts={drafts} javaSandboxUrl={javaSandboxUrl} />;
}
