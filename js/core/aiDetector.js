// Twin of src/features/tasks/detection/aiDetector.ts — hand-maintained, not generated.
// src/features/tasks/detection/aiDetector.ts is the source of truth: change it
// there first, then mirror the change here. tests/twinParity.test.js fails if
// the two drift.
//
// The model as another detector (#741), for the legacy Tasks tab (#767). It
// runs only when a student asks (shouldOfferAi is the whole policy), and every
// failure returns no proposals plus a reason to show — the deterministic
// reading the student already has is never discarded.
//
// One deliberate difference: the shell passes its ApiClient; legacy has none,
// so createAiDetector takes the optional transport deps tasksApi.js accepts
// (tests inject a fake fetch through them; the page passes nothing).

import { extractTasks } from './tasksApi.js';

const _AI_NOTES = {
  unavailable: 'Shohoj can’t read announcements right now — your own reading still works.',
  quota_exhausted:
    'You’ve used today’s free readings — your own reading still works. More open up tomorrow.',
  failed: 'That didn’t work. You can try again, or add the task yourself.',
};

/** Offer the model only when the free reading found nothing dated. */
export function shouldOfferAi(proposals) {
  if (proposals.length === 0) return true;
  return proposals.every((task) => task.dueAt === null);
}

export function createAiDetector(deps) {
  return {
    source: 'AI_SUGGESTION',
    async detect(input, context) {
      const result = await extractTasks(input, context.knownCourseCodes ?? [], deps);

      if (!result.ok) {
        const outcome =
          result.error.apiCode === 'unavailable'
            ? 'unavailable'
            : result.error.apiCode === 'quota_exceeded'
              ? 'quota_exhausted'
              : 'failed';
        return {
          source: 'AI_SUGGESTION',
          detected: [],
          unrecognised: [],
          outcome,
          note: result.error.userMessage || _AI_NOTES[outcome],
        };
      }

      return {
        source: 'AI_SUGGESTION',
        detected: result.value.tasks.map((task) => ({
          title: task.title,
          type: task.type,
          dueAt: task.dueAt,
          courseCode: task.courseCode,
          syllabus: task.syllabus,
          confidence: task.confidence,
          // The model quotes the sentence it read; there is no real offset to
          // point into, so it rides at index 0 rather than a fabricated one.
          evidence: task.evidence === null ? {} : { dueAt: { text: task.evidence, index: 0 } },
        })),
        unrecognised: [],
        outcome: 'ok',
        note: '',
      };
    },
  };
}
