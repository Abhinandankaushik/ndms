export interface PendingDelta {
  readonly inFlight: number;
  readonly queued: number;
}

export const NO_PENDING_DELTA: PendingDelta = Object.freeze({ inFlight: 0, queued: 0 });

export interface DeltaSyncDefinition<TTarget, TValue> {
  keyOf(target: TTarget): string;
  maxDelta: number;
  readShown(target: TTarget): TValue | undefined;
  show(target: TTarget, value: TValue): void;
  /** Must clamp exactly as the server does, or the optimistic value drifts from the saved one at the limits. */
  applyDelta(value: TValue, delta: number): TValue;
  sameValue(a: TValue, b: TValue): boolean;
  send(target: TTarget, delta: number): Promise<TValue>;
  cancelReadsInFlight(): boolean;
  requestResync(): void;
  onFailure(error: unknown): void;
  onIdle(): void;
}

export interface DeltaSync<TTarget, TValue> {
  push(target: TTarget, delta: number): void;
  offer(target: TTarget, value: TValue): void;
  hasBusyTargets(): boolean;
  pendingFor(target: TTarget): PendingDelta;
  subscribe(listener: () => void): () => void;
}

interface Lane<TValue> {
  confirmed: TValue;
  inFlight: number;
  queued: number;
  awaitingEcho: boolean;
  needsResync: boolean;
}

// Deltas for one target go out one request at a time, and taps made meanwhile are summed into the next request.
// Each response is then the server's value after everything this device has sent so far, so it replaces the
// confirmed value outright and the display (confirmed value plus pending deltas) never counts a tap twice.
// A failed delta is never retried: the endpoints take no idempotency key, and a retry after a lost response would
// count the same people twice.
export function createDeltaSync<TTarget, TValue>(definition: DeltaSyncDefinition<TTarget, TValue>): DeltaSync<TTarget, TValue> {
  const lanes = new Map<string, Lane<TValue>>();
  const pendingByKey = new Map<string, PendingDelta>();
  const listeners = new Set<() => void>();

  function publish(key: string, lane: Lane<TValue> | null): void {
    if (lane) pendingByKey.set(key, { inFlight: lane.inFlight, queued: lane.queued });
    else pendingByKey.delete(key);
    for (const listener of listeners) listener();
  }

  function projected(lane: Lane<TValue>): TValue {
    return definition.applyDelta(definition.applyDelta(lane.confirmed, lane.inFlight), lane.queued);
  }

  function openLane(target: TTarget, key: string): Lane<TValue> | null {
    const shown = definition.readShown(target);
    if (shown === undefined) return null;
    const lane: Lane<TValue> = { confirmed: shown, inFlight: 0, queued: 0, awaitingEcho: false, needsResync: false };
    lanes.set(key, lane);
    return lane;
  }

  function closeLane(key: string, lane: Lane<TValue>): void {
    lanes.delete(key);
    publish(key, null);
    if (lane.needsResync) definition.requestResync();
    definition.onIdle();
  }

  function push(target: TTarget, delta: number): void {
    if (!Number.isSafeInteger(delta) || delta === 0) return;
    const key = definition.keyOf(target);
    const lane = lanes.get(key) ?? openLane(target, key);
    if (!lane) return;
    // A read that lands mid-burst may or may not include the request in flight, so it is discarded and repeated.
    if (definition.cancelReadsInFlight()) lane.needsResync = true;
    lane.queued += delta;
    definition.show(target, projected(lane));
    publish(key, lane);
    if (lane.inFlight === 0) void drain(target, key, lane);
  }

  async function drain(target: TTarget, key: string, lane: Lane<TValue>): Promise<void> {
    while (lane.queued !== 0) {
      const delta = Math.sign(lane.queued) * Math.min(Math.abs(lane.queued), definition.maxDelta);
      lane.inFlight = delta;
      lane.queued -= delta;
      lane.awaitingEcho = true;
      publish(key, lane);
      try {
        lane.confirmed = await definition.send(target, delta);
      } catch (error) {
        lane.inFlight = 0;
        lane.queued = 0;
        definition.show(target, lane.confirmed);
        definition.onFailure(error);
        // The change may have been saved with only its response lost.
        lane.needsResync = true;
        closeLane(key, lane);
        return;
      }
      lane.inFlight = 0;
      definition.show(target, projected(lane));
      publish(key, lane);
    }
    closeLane(key, lane);
  }

  // Values pushed by the server carry no version, so while a request is in flight they cannot be ordered against
  // its response. The expected echo of that request is ignored once; anything else is settled by a fresh read.
  function offer(target: TTarget, value: TValue): void {
    const lane = lanes.get(definition.keyOf(target));
    if (!lane) {
      definition.show(target, value);
      return;
    }
    const isEchoOfRequestInFlight =
      lane.inFlight !== 0 &&
      lane.awaitingEcho &&
      definition.sameValue(value, definition.applyDelta(lane.confirmed, lane.inFlight));
    if (isEchoOfRequestInFlight) lane.awaitingEcho = false;
    else lane.needsResync = true;
  }

  return {
    push,
    offer,
    hasBusyTargets: () => lanes.size > 0,
    pendingFor: (target) => pendingByKey.get(definition.keyOf(target)) ?? NO_PENDING_DELTA,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
