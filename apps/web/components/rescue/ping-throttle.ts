import type { LatLon } from '@/lib/api/types';
import { haversineMetres } from './geo';

export const PING_MIN_INTERVAL_MS = 10_000;
export const PING_MIN_MOVE_M = 20;

export interface PingHistory {
  /** When the most recent ping left the phone, whatever became of it. */
  lastAttemptAtMs: number | null;
  /** The last position the API answered for. */
  lastDelivered: LatLon | null;
}

export type PingDecision = { action: 'send' } | { action: 'wait'; delayMs: number } | { action: 'skip' };

// CLAUDE.md rule 6: at most one ping per 10 s, and nothing until the team is 20 m from the position the API
// last received. A move made during the quiet period is sent once it ends instead of being dropped, because a
// team that then stands still produces no further fixes to carry it.
export function decidePing(history: PingHistory, fix: LatLon, nowMs: number): PingDecision {
  if (history.lastDelivered && haversineMetres(history.lastDelivered, fix) < PING_MIN_MOVE_M) {
    return { action: 'skip' };
  }
  const waitMs = history.lastAttemptAtMs === null ? 0 : history.lastAttemptAtMs + PING_MIN_INTERVAL_MS - nowMs;
  return waitMs > 0 ? { action: 'wait', delayMs: waitMs } : { action: 'send' };
}
