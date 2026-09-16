'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

const TICK_MS = 15_000;

const useClockStore = create<{ now: number }>()(() => ({ now: Date.now() }));

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(): () => void {
  subscribers += 1;
  if (subscribers === 1) {
    useClockStore.setState({ now: Date.now() });
    timer = setInterval(() => useClockStore.setState({ now: Date.now() }), TICK_MS);
  }
  return () => {
    subscribers -= 1;
    if (subscribers === 0) clearInterval(timer);
  };
}

/** A shared clock for relative times ("14 min ago"); one interval serves every component on screen. */
export function useNow(): number {
  useEffect(subscribe, []);
  return useClockStore((state) => state.now);
}
