// src/features/assistant/assistantClient.ts
//
// Typed boundary for the Shohoj Assistant transport (#435, POST /api/assistant,
// worker/index.js handleAssistant).
//
// The implementation lives in js/core/assistantClient.js and is re-exported
// here, unchanged. It has to be authored in vanilla JS: the legacy page needs
// it too, and build3.py flattens js/ into shohoj.html without a TypeScript
// step. Rather than keep a second copy of the Worker contract in sync, the
// shell consumes the same module through js/core/assistantClient.d.ts — the
// catalog.ts / departments.ts precedent.
//
// One stateless chat turn: the drawer sends the visible transcript plus the new
// user message and gets a single reply string back. The transcript is clamped
// to the Worker's contract (≤20 messages, ≤4000 chars each, first and last must
// be user turns) so a payload the client builds is never rejected as malformed.

export type {
  AssistantAvailability,
  AssistantCapabilityOptions,
  AssistantClientOptions,
  AssistantErrorCode,
  AssistantMessage,
  AssistantTranscriptStorage,
  AssistantTurnResult,
} from '../../../js/core/assistantClient.js';

export {
  ASSISTANT_MAX_MESSAGES,
  ASSISTANT_MAX_MESSAGE_CHARS,
  ASSISTANT_TRANSCRIPT_KEY,
  clampTranscript,
  examplePromptsForTab,
  fetchAssistantAvailability,
  readStoredTranscript,
  sendAssistantTurn,
  writeStoredTranscript,
} from '../../../js/core/assistantClient.js';
