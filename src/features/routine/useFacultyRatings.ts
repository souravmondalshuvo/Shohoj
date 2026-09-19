/**
 * Faculty ratings for the Routine route (#688).
 *
 * Legacy's `_loadFacultyRatings`, as a hook: prefer a fresh cache, otherwise
 * pull the recent-reviews feed through the provider's repo, aggregate it and
 * build the rating map — then cache it under the key both front ends share
 * (`RATING_CACHE_KEY`, format owned by core/routineFaculty).
 *
 * Failure is not an error state. Ratings decorate a section list that is
 * perfectly usable without them, so a rejected fetch leaves `loaded` false and
 * the badges simply do not appear — the same thing legacy does.
 */

import { useEffect, useState } from 'react';

import { aggregateByFaculty } from '../../core/reviews';
import {
  RATING_CACHE_KEY,
  buildFacultyRatingMap,
  parseRatingCache,
  serializeRatingCache,
  type FacultyRating,
} from '../../core/routineFaculty';
import { useFetchRecentReviews } from '../calculator/FacultyReviewsProvider';

/** How many recent reviews to aggregate. Matches the legacy tab. */
export const REVIEWS_FETCH_LIMIT = 1000;

const EMPTY: Map<string, FacultyRating> = new Map();

export interface FacultyRatings {
  /** initials → rating. Empty until (and unless) ratings load. */
  ratingMap: Map<string, FacultyRating>;
  /** True once a map is in hand, from cache or from the feed. */
  loaded: boolean;
}

function readCache(): Map<string, FacultyRating> | null {
  try {
    return parseRatingCache(localStorage.getItem(RATING_CACHE_KEY));
  } catch {
    // Private mode / storage disabled: not cached, so fetch.
    return null;
  }
}

function writeCache(ratingMap: Map<string, FacultyRating>): void {
  try {
    localStorage.setItem(RATING_CACHE_KEY, JSON.stringify(serializeRatingCache(ratingMap)));
  } catch {
    // Quota or disabled storage — caching is best-effort.
  }
}

export function useFacultyRatings(): FacultyRatings {
  const fetchRecent = useFetchRecentReviews();
  const [state, setState] = useState<FacultyRatings>(() => {
    const cached = readCache();
    return cached ? { ratingMap: cached, loaded: true } : { ratingMap: EMPTY, loaded: false };
  });

  useEffect(() => {
    if (state.loaded) return;
    let live = true;
    fetchRecent(REVIEWS_FETCH_LIMIT)
      .then((reviews) => {
        if (!live) return;
        const ratingMap = buildFacultyRatingMap(aggregateByFaculty(reviews ?? []));
        // Nothing to show and nothing worth caching: leave it unloaded so a
        // later visit tries again rather than sitting on an empty map.
        if (ratingMap.size === 0) return;
        setState({ ratingMap, loaded: true });
        writeCache(ratingMap);
      })
      .catch(() => {
        // The repo has already logged the machine-readable code; sections
        // render unbadged (docs/SECURITY.md — no raw SDK message to the user).
      });
    return () => {
      live = false;
    };
    // fetchRecent is recreated on provider bumps; re-running then is correct.
  }, [fetchRecent, state.loaded]);

  return state;
}
