'use client';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { bootstrapSession, useSessionStore } from '@/lib/auth/session';
import { getQueryClient } from '@/lib/query/query-client';
import { bindRealtimeToSession } from '@/lib/realtime/socket';

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  useEffect(() => bindRealtimeToSession(), []);

  useEffect(() => clearCacheWhenIdentityChanges(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

// Cached responses belong to the user who fetched them; the next person on a shared device must
// never see them.
function clearCacheWhenIdentityChanges(queryClient: QueryClient): () => void {
  return useSessionStore.subscribe((state, previous) => {
    const signedOut = previous.status === 'authenticated' && state.status !== 'authenticated';
    const switchedUser = Boolean(previous.user && state.user && previous.user.id !== state.user.id);
    if (signedOut || switchedUser) queryClient.clear();
  });
}
