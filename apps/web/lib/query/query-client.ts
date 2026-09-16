import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/api-error';

const MAX_QUERY_RETRIES = 2;

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          failureCount < MAX_QUERY_RETRIES && error instanceof ApiError && error.isRetryable,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// A fresh client per server render keeps users' data isolated; the browser keeps one for its lifetime.
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}
