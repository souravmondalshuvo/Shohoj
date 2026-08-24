// Types for js/core/assistantHistory.js — the device-local Assistant history
// store (#543). Hand-written twin of the module, same convention as
// assistantClient.d.ts.

import type { AssistantMessage } from './assistantClient';

export const ASSISTANT_HISTORY_DB: string;
export const ASSISTANT_HISTORY_STORE: string;
export const ASSISTANT_HISTORY_RECORD: string;

/** The transcript stored for `owner` on this device, or [] when there is none. */
export function loadStoredHistory(
  owner: string | null | undefined,
  factory?: IDBFactory | null,
): Promise<AssistantMessage[]>;

/** Persist `transcript` for `owner`. An empty transcript deletes the record. */
export function saveStoredHistory(
  owner: string | null | undefined,
  transcript: readonly AssistantMessage[],
  factory?: IDBFactory | null,
): Promise<boolean>;

/** Delete the stored transcript, whoever owns it. */
export function clearStoredHistory(factory?: IDBFactory | null): Promise<boolean>;
