import { create } from 'zustand';
import type { QueueSort } from '@/lib/api/types';

// The API rejects a term shorter than this, so the query only runs once it is reachable.
export const MIN_SEARCH_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;

export const TIME_WINDOWS = [
  { id: 'any', label: 'Any time', minutes: null },
  { id: '1h', label: 'Last hour', minutes: 60 },
  { id: '24h', label: 'Last 24 hours', minutes: 60 * 24 },
  { id: '7d', label: 'Last 7 days', minutes: 60 * 24 * 7 },
] as const;

export type TimeWindowId = (typeof TIME_WINDOWS)[number]['id'];

interface IncidentSearchState {
  term: string;
  sort: QueueSort;
  window: TimeWindowId;
}

const INITIAL: IncidentSearchState = { term: '', sort: 'priority', window: 'any' };

export const useIncidentSearch = create<IncidentSearchState>()(() => INITIAL);

export function setSearchTerm(term: string): void {
  useIncidentSearch.setState({ term });
}

export function clearSearchTerm(): void {
  useIncidentSearch.setState({ term: '' });
}

export function setQueueSort(sort: QueueSort): void {
  useIncidentSearch.setState({ sort });
}

export function setTimeWindow(window: TimeWindowId): void {
  useIncidentSearch.setState({ window });
}

export function resetIncidentSearch(): void {
  useIncidentSearch.setState(INITIAL);
}

export const isSearching = (term: string): boolean => term.trim().length >= MIN_SEARCH_LENGTH;

const WINDOW_BUCKET_MS = 60_000;

/**
 * Resolved at call time rather than stored, so a window keeps meaning "the last hour" as the
 * shift wears on instead of freezing to the hour it was picked. Snapped to the minute because
 * this value is part of a query key: a fresh timestamp per render would refetch forever.
 */
export function windowStart(window: TimeWindowId, now: number = Date.now()): string | undefined {
  const minutes = TIME_WINDOWS.find((entry) => entry.id === window)?.minutes;
  if (minutes === null || minutes === undefined) return undefined;
  const start = now - minutes * 60_000;
  return new Date(Math.floor(start / WINDOW_BUCKET_MS) * WINDOW_BUCKET_MS).toISOString();
}

export function isDefaultIncidentSearch(state: IncidentSearchState): boolean {
  return state.term === '' && state.sort === INITIAL.sort && state.window === INITIAL.window;
}
