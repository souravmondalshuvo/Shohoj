// src/services/cloudSync/saveAnnouncer.ts
//
// The typed analogue of the legacy window._shohoj_onSave hook (#333): the
// shell's local persist path (persistCalculatorState) announces each
// successful write here, and the CloudSyncProvider — when a signed-in cloud
// shell is active — subscribes to queue the debounced cloud save. Decoupled
// on purpose: the calculator/planner routes keep persisting locally with no
// knowledge of cloud sync, and an offline shell has no subscriber so this is
// an inert broadcast.

export type LocalSaveListener = (snapshotJson: string) => void;

const listeners = new Set<LocalSaveListener>();

/** Broadcast a successful local write (the exact JSON persisted). */
export function announceLocalSave(snapshotJson: string): void {
  for (const listener of listeners) listener(snapshotJson);
}

/** Subscribe to local writes; returns an unsubscribe fn. */
export function onLocalSave(listener: LocalSaveListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
