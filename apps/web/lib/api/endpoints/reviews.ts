import { apiFetch, type CallOptions } from '../client';
import type { PendingReview, Review, ReviewResolution } from '../types';

export function listPendingReviews(query: { limit?: number } = {}, options?: CallOptions): Promise<PendingReview[]> {
  return apiFetch<PendingReview[]>('/reviews', { ...options, query: { limit: query.limit } });
}

export function resolveReview(id: string, resolution: ReviewResolution): Promise<Review> {
  return apiFetch<Review>(`/reviews/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: resolution });
}
