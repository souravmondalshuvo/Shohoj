// src/features/tasks/detection/aiDetector.ts
//
// The model as another detector (#741).
//
// Everything structural was settled in #735: this returns proposals, it cannot
// reach the Tasks API, and what it returns is reviewed and confirmed by a
// student before anything exists. The only thing new here is that the reading
// happens on a server instead of in the page.
//
// WHY IT IS NOT AUTOMATIC
//
// The deterministic parser runs on every paste — free, instant, private. This
// runs when a student asks for it, because it costs real money from one
// person's card and because a second opinion nobody requested is not worth a
// spinner. `shouldOfferAi` below is the whole policy.
//
// WHY FAILURE IS NOT AN ERROR
//
// "AI must not become a hard dependency" is the brief's rule, and this file is
// where it is either kept or quietly broken. Every failure path returns the
// same thing: no proposals, and a reason the panel can say out loud. The
// deterministic result the student already has is never discarded, never
// replaced by an error state, and never made to wait on this.

import type { ApiClient } from '../../../platform/api/apiClient.ts';
import { extractTasks } from '../../../platform/api/tasks.ts';
import type { DetectedTask, DetectionContext, DetectionResult, TaskDetector } from './types.ts';

/**
 * Why an extraction produced nothing.
 *
 * `unavailable` and `failed` are deliberately different: the first is a
 * feature this deployment does not currently have, the second is a thing that
 * went wrong. A student told "unavailable" knows not to retry; a student told
 * "failed" knows it might work next time.
 */
export type ExtractionOutcome = 'ok' | 'unavailable' | 'failed';

export interface AiDetectionResult extends DetectionResult {
  readonly outcome: ExtractionOutcome;
  /** A sentence the panel can show. Empty when the outcome is `ok`. */
  readonly note: string;
}

const NOTES: Record<Exclude<ExtractionOutcome, 'ok'>, string> = {
  unavailable: 'Shohoj can’t read announcements right now — your own reading still works.',
  failed: 'That didn’t work. You can try again, or add the task yourself.',
};

/**
 * Should the panel offer a second, paid reading?
 *
 * Only when the free parser came up short — nothing at all, or proposals with
 * no date, which are the ones a model is most likely to improve on. A student
 * whose paste already produced dated tasks is offered nothing, so the common
 * case costs nothing.
 */
export function shouldOfferAi(detected: readonly DetectedTask[]): boolean {
  if (detected.length === 0) return true;
  return detected.every((task) => task.dueAt === null);
}

/**
 * Build the AI detector over an API client.
 *
 * Takes the client rather than reaching for one, so the detector stays a plain
 * value a test can drive with a stub — the same shape the deterministic
 * detector already has.
 */
export function createAiDetector(client: ApiClient): TaskDetector {
  return {
    source: 'AI_SUGGESTION',
    async detect(input: string, context: DetectionContext): Promise<AiDetectionResult> {
      const result = await extractTasks(client, input, context.knownCourseCodes ?? []);

      if (!result.ok) {
        // `unavailable` is the server saying it has no key, no budget or no
        // provider. Anything else is a genuine failure. Both leave the
        // student exactly where they were.
        const outcome: ExtractionOutcome =
          result.error.apiCode === 'unavailable' ? 'unavailable' : 'failed';
        return {
          source: 'AI_SUGGESTION',
          detected: [],
          unrecognised: [],
          outcome,
          note: result.error.userMessage || NOTES[outcome],
        };
      }

      return {
        source: 'AI_SUGGESTION',
        detected: result.value.map(
          (task): DetectedTask => ({
            title: task.title,
            type: task.type,
            dueAt: task.dueAt,
            courseCode: task.courseCode,
            syllabus: task.syllabus,
            confidence: task.confidence,
            // The model quotes the sentence it read. Carried as evidence at
            // index 0 rather than a real offset: the extractor works on text
            // the server never returns, so there is no span to point into —
            // and a fabricated offset would highlight the wrong words.
            evidence:
              task.evidence === null ? {} : { dueAt: { text: task.evidence, index: 0 } },
          }),
        ),
        unrecognised: [],
        outcome: 'ok',
        note: '',
      };
    },
  };
}
