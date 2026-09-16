'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { PendingReview, ReviewReason } from '@/lib/api/types';
import { pendingReviewsQuery } from '../queries';

export const NO_REVIEW_REASONS: readonly ReviewReason[] = [];

/** Pending reviews grouped by incident, so rows and drawers can show that a human decision is outstanding. */
export function usePendingReviewsByIncident(): ReadonlyMap<string, readonly PendingReview[]> {
  const { data } = useQuery(pendingReviewsQuery());
  return useMemo(() => {
    const grouped = new Map<string, PendingReview[]>();
    for (const review of data ?? []) grouped.set(review.incidentId, [...(grouped.get(review.incidentId) ?? []), review]);
    return grouped;
  }, [data]);
}

// Arrays keep their identity between renders unless the reviews change, so memoised queue rows stay skipped.
export function usePendingReviewReasons(): ReadonlyMap<string, readonly ReviewReason[]> {
  const reviewsByIncident = usePendingReviewsByIncident();
  return useMemo(
    () =>
      new Map(
        [...reviewsByIncident].map(([incidentId, reviews]) => [
          incidentId,
          [...new Set(reviews.map((review) => review.reason))],
        ]),
      ),
    [reviewsByIncident],
  );
}
