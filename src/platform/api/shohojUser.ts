// src/platform/api/shohojUser.ts
//
// The internal Shohoj user, as the frontend sees it (#710).
//
// This is the seam between "who is signed in" and "who this is in Shohoj", and
// the two are not the same question. `AuthSnapshot` (src/platform/auth/) answers
// the first from the Firebase SDK: a uid, an email, a campus derived from that
// email, all of it client-side and good only for gating UI. This answers the
// second from the server: a durable Shohoj user id that academic records point
// at, with a campus the backend resolved from a token it verified itself.
//
// Tasks needs the second. A task belongs to a Shohoj user id — never to a
// Firebase uid, and never to an identity the client asserted — so that moving
// off Firebase Auth, or moving Tasks onto a relational store with its own
// `users` table, does not mean rewriting every record that points at a person.
//
// The schema here is the frontend half of the contract in docs/api/. It is
// deliberately strict about what it requires and tolerant about what it ignores:
// a field the server adds later must not break a client that has not shipped yet.

import type { ShohojError } from '../../core/errors.ts';
import type { Result } from '../../core/result.ts';
import { type UniversityId, isUniversityId } from '../../core/university.ts';
import { z } from '../../shared/validation/schema.ts';
import type { ApiClient, ApiRequestOptions } from './apiClient.ts';

/**
 * A campus id, or null.
 *
 * Null is a real, expected value, not a failure: an admin account on no
 * registered campus resolves to no campus, and the UI must ask rather than
 * assume. `isUniversityId` keeps an unrecognised campus from being narrowed to
 * `UniversityId` — a client that has not shipped support for a newly-added
 * campus should read it as "not one I know", not crash and not pretend.
 */
const UniversitySchema = z
  .string()
  .nullable()
  .transform((value): UniversityId | null => (isUniversityId(value) ? value : null));

/**
 * `usr_` + 32 hex characters. Matched rather than accepted as any string: this
 * value becomes the owner key on every task, and a malformed one would be
 * discovered at write time, deep inside a feature, instead of here.
 */
const ShohojUserIdSchema = z.string().regex(/^usr_[0-9a-f]{32}$/, 'malformed Shohoj user id');

export const ShohojUserSchema = z.object({
  id: ShohojUserIdSchema,
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  university: UniversitySchema,
  /** From the student's own transcript import, never from the token. */
  studentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ShohojUser = z.infer<typeof ShohojUserSchema>;

/**
 * The envelope, not the bare object.
 *
 * `{ user: … }` rather than the user at the top level so the response can grow
 * a sibling — onboarding state, entitlements — without every existing client
 * having to be taught that the shape moved.
 */
export const MeResponseSchema = z.object({ user: ShohojUserSchema });

/**
 * Fetch (bootstrapping on the server's side, on first call) the signed-in
 * student's Shohoj user record.
 *
 * Returns a `Result`. A signed-out caller gets a `PermissionError` without a
 * network request; an unreachable backend gets a `WorkerError`. Neither is an
 * exception, because neither is exceptional — Shohoj's offline-first tools must
 * keep working when this fails, and a thrown error at this seam is how that
 * stops being true.
 */
export async function fetchShohojUser(
  client: ApiClient,
  options?: ApiRequestOptions,
): Promise<Result<ShohojUser, ShohojError>> {
  const response = await client.get('/me', MeResponseSchema, options);
  return response.ok ? { ok: true, value: response.value.user } : response;
}
