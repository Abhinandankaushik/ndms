'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/lib/utils';

export const HOLD_DURATION_MS = 3_000;
const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// A thumb drifts while it holds; only a deliberate slide off the button abandons the hold.
const DRIFT_TOLERANCE_PX = 32;

interface ActiveHold {
  pointerId: number | null;
  frame: number;
}

export interface SosButtonProps {
  onActivate: () => void;
  /** A click that arrives without a hold, which is how screen readers and switch access press buttons. */
  onAssistiveActivate: () => void;
  busy: boolean;
  statusLabel: string;
  describedBy?: string;
}

export function SosButton({ onActivate, onAssistiveActivate, busy, statusLabel, describedBy }: SosButtonProps) {
  const ringRef = useRef<SVGCircleElement>(null);
  const holdRef = useRef<ActiveHold | null>(null);
  const onActivateRef = useRef(onActivate);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    onActivateRef.current = onActivate;
  });

  const drawProgress = useCallback((fraction: number) => {
    ringRef.current?.style.setProperty('stroke-dashoffset', String(RING_CIRCUMFERENCE * (1 - fraction)));
  }, []);

  const clearHold = useCallback((): boolean => {
    const hold = holdRef.current;
    if (!hold) return false;
    cancelAnimationFrame(hold.frame);
    holdRef.current = null;
    setSecondsLeft(null);
    return true;
  }, []);

  const endHold = useCallback(() => {
    if (clearHold()) drawProgress(0);
  }, [clearHold, drawProgress]);

  const startHold = (pointerId: number | null) => {
    if (busy || holdRef.current) return;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const hold = holdRef.current;
      if (!hold) return;
      const elapsed = Math.max(0, now - startedAt);
      if (elapsed >= HOLD_DURATION_MS) {
        clearHold();
        drawProgress(1);
        navigator.vibrate?.(200);
        onActivateRef.current();
        return;
      }
      drawProgress(elapsed / HOLD_DURATION_MS);
      setSecondsLeft(Math.ceil((HOLD_DURATION_MS - elapsed) / 1_000));
      hold.frame = requestAnimationFrame(tick);
    };
    holdRef.current = { pointerId, frame: requestAnimationFrame(tick) };
    setSecondsLeft(Math.ceil(HOLD_DURATION_MS / 1_000));
  };

  // A hold must never survive the page being hidden: animation frames pause while hidden and would complete
  // the moment the page came back, for example after the phone was locked mid-press.
  useEffect(() => {
    const endWhenHidden = () => {
      if (document.visibilityState === 'hidden') endHold();
    };
    document.addEventListener('visibilitychange', endWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', endWhenHidden);
      endHold();
    };
  }, [endHold]);

  useEffect(() => {
    if (busy) {
      clearHold();
      drawProgress(1);
    } else if (!holdRef.current) {
      drawProgress(0);
    }
  }, [busy, clearHold, drawProgress]);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the hold then ends on the next pointer event.
    }
    startHold(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (holdRef.current?.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const drifted =
      event.clientX < bounds.left - DRIFT_TOLERANCE_PX ||
      event.clientX > bounds.right + DRIFT_TOLERANCE_PX ||
      event.clientY < bounds.top - DRIFT_TOLERANCE_PX ||
      event.clientY > bounds.bottom + DRIFT_TOLERANCE_PX;
    if (drifted) endHold();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (holdRef.current?.pointerId === event.pointerId) endHold();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) return;
    event.preventDefault();
    if (!event.repeat) startHold(null);
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) return;
    event.preventDefault();
    if (holdRef.current?.pointerId === null) endHold();
  };

  // Pointer and keyboard presses never produce a click here (the hold keys are prevented), so a click with no
  // press count comes from assistive technology.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0 && !busy) onAssistiveActivate();
  };

  const isHolding = secondsLeft !== null;

  return (
    <div className="relative size-64 max-w-full">
      <svg viewBox="0 0 120 120" aria-hidden className={cn('absolute inset-0 size-full -rotate-90', busy && 'animate-pulse')}>
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-red-100" />
        <circle
          ref={ringRef}
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="8"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE}
          className="stroke-red-700"
        />
      </svg>
      <button
        type="button"
        aria-label="SOS. Press and hold for 3 seconds to ask for help."
        aria-describedby={describedBy}
        aria-disabled={busy}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={endHold}
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          'absolute inset-6 flex touch-none flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-xl ring-4 ring-red-600/25 transition-transform duration-150 outline-none select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] focus-visible:ring-8 focus-visible:ring-sky-500',
          isHolding && 'scale-95 bg-red-700',
          busy && 'cursor-progress bg-red-700',
        )}
      >
        <span className="text-6xl leading-none font-black tracking-wider">SOS</span>
        <span className="mt-2 px-6 text-center text-sm leading-tight font-semibold">
          {busy ? statusLabel : isHolding ? `Keep holding… ${secondsLeft}` : 'Hold for 3 seconds'}
        </span>
      </button>
      <span aria-live="assertive" className="sr-only">
        {isHolding ? `Keep holding, ${secondsLeft}` : ''}
      </span>
    </div>
  );
}

function isHoldKey(key: string): boolean {
  return key === ' ' || key === 'Enter';
}
