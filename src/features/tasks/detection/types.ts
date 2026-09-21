// src/features/tasks/detection/types.ts
//
// The integration boundary (#735).
//
// Everything that finds academic work in unstructured text produces this shape:
// a pasted announcement today, a Gmail message later, an AI extractor later
// still. Nothing downstream — the review list, the confirm flow, the Tasks API
// — can tell which produced it, and that is the whole point. A provider arrives
// by implementing `TaskDetector`; it does not arrive by changing the task model.
//
// The brief's rule for Gmail is Detect → Suggest → Confirm → Create, and the
// types enforce the first three of those: a detector returns DETECTIONS, which
// are proposals. Nothing here can create a task. The only path from a detection
// to a Task runs through a student saying yes.

import type { TaskType } from '../../../platform/api/tasks.ts';

/**
 * Where a detected value came from in the source text.
 *
 * Carried so the UI can show a student WHY Shohoj thinks there is a quiz on the
 * 25th. A suggestion you cannot interrogate is one you either accept blindly or
 * ignore entirely, and both are failures.
 */
export interface Evidence {
  /** The exact substring that produced the value. */
  readonly text: string;
  /** Index into the source, so the UI can highlight in place if it wants to. */
  readonly index: number;
}

/**
 * How sure the detector is.
 *
 * Three bands rather than a number, for the same reason priority scores became
 * bands: 0.73 invites a precision no detector has. `low` still gets shown —
 * this is a proposal a human is about to read — but the UI can order and label
 * accordingly.
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * One piece of academic work found in text.
 *
 * Every field except `title` is nullable, and that is deliberate. **An invented
 * deadline is worse than an absent one**: where the text does not say, the
 * field comes back null and the student fills it. This is the same choice
 * connectScheduleImport makes about class times.
 */
export interface DetectedTask {
  readonly title: string;
  readonly type: TaskType;
  /** ISO 8601 instant, or null when the text carried no usable date. */
  readonly dueAt: string | null;
  /** Course code as written, uppercased. Null when the text named none. */
  readonly courseCode: string | null;
  /** A syllabus hint — "chapters 4-6" — for the assessment, not the title. */
  readonly syllabus: string | null;
  readonly confidence: Confidence;
  /** What in the source produced each field, keyed by field name. */
  readonly evidence: Readonly<
    Partial<Record<'type' | 'dueAt' | 'courseCode' | 'syllabus', Evidence>>
  >;
}

/** Where a detection came from. Mirrors `TaskSource` on the Task model. */
export type DetectionSource = 'PASTE' | 'GMAIL' | 'AI_SUGGESTION';

export interface DetectionResult {
  readonly source: DetectionSource;
  readonly detected: readonly DetectedTask[];
  /**
   * Lines the detector read but could not place.
   *
   * Reported rather than dropped, because "I found nothing in these three
   * paragraphs" is information — it tells a student the paste worked and the
   * text simply did not contain what they hoped, rather than leaving them
   * wondering whether it parsed at all.
   */
  readonly unrecognised: readonly string[];
}

/**
 * A source of detections.
 *
 * Deliberately synchronous-or-async and free of any transport: a Gmail detector
 * would fetch, an AI one would call a model, this one reads a string. What they
 * share is that they return proposals and never touch the Tasks API.
 */
export interface TaskDetector {
  readonly source: DetectionSource;
  detect(input: string, context: DetectionContext): DetectionResult | Promise<DetectionResult>;
}

/**
 * What a detector may use to interpret text.
 *
 * `now` is injected so detection is deterministic and testable — a date like
 * "25 September" means something different depending on when you read it, and
 * a detector that reads the clock itself cannot be pinned by a test.
 *
 * `knownCourseCodes` lets a detector prefer a course the student is actually
 * enrolled in over a string that merely looks like a code.
 */
export interface DetectionContext {
  readonly now: Date;
  readonly knownCourseCodes?: readonly string[];
}
