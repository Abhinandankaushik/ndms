'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/lib/auth/session';
import { flushOutboxNow } from '@/lib/offline/drain';
import { refreshOutbox } from '@/lib/offline/outbox';
import { startOutboxRunner } from '@/lib/offline/runner';
import { API_CACHE_NAME } from '@/lib/offline/sw-contract';
import { OfflineStatusBar } from './OfflineStatusBar';

export function OfflineRuntime() {
  useEffect(() => startOutboxRunner(), []);
  useEffect(() => followSignedInUser(), []);

  return <OfflineStatusBar />;
}

function followSignedInUser(): () => void {
  return useSessionStore.subscribe((state, previous) => {
    if (state.user?.id === previous.user?.id) return;
    void refreshOutbox();
    if (state.user) void flushOutboxNow();
    else void forgetCachedResponses();
  });
}

// What the service worker cached is not per-account, so the next person to sign in on a shared phone
// must not be shown the previous one's data the first time the network is slow.
async function forgetCachedResponses(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(API_CACHE_NAME);
  } catch {
    // Storage can be blocked entirely; there is then nothing cached to leak either.
  }
}
