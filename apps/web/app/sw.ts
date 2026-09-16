import { defaultCache } from '@serwist/next/worker';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from 'serwist';
// Relative, not "@/": Serwist compiles this file on its own, outside the app's path aliases.
import { API_CACHE_NAME, FLUSH_OUTBOX_MESSAGE, FLUSH_OUTBOX_TAG, MAX_CACHED_TILES, TILE_CACHE_NAME } from '../lib/offline/sw-contract';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

interface BackgroundSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

const DAY_SECONDS = 24 * 60 * 60;

// Every rule below is GET-only, which is what `RuntimeCaching` defaults to and what Serwist registers.
// An SOS, a report and a sync batch are POSTs, so none of them can ever be answered from, or written
// to, a cache.
const runtimeCaching: RuntimeCaching[] = [
  {
    // A cached session response would hand the next person on a shared phone the previous account.
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/v1/auth/'),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/v1/'),
    handler: new NetworkFirst({
      cacheName: API_CACHE_NAME,
      // Three seconds is the point past which a flood-zone connection is better treated as absent:
      // the last known shelters and alerts are more use than a spinner.
      networkTimeoutSeconds: 3,
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: DAY_SECONDS })],
    }),
  },
  {
    // Only tiles the person has already looked at reach this cache. Pre-fetching an area to fill it
    // would breach the OSM tile usage policy, so nothing here ever asks for a tile on its own.
    matcher: ({ url }) => url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org'),
    handler: new CacheFirst({
      cacheName: TILE_CACHE_NAME,
      plugins: [
        new ExpirationPlugin({
          maxEntries: MAX_CACHED_TILES,
          maxAgeSeconds: 30 * DAY_SECONDS,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();

// The worker cannot drain the outbox itself: the access token lives in memory in the page and is
// never written to storage, so nothing here can authenticate POST /incidents/sync. A Background Sync
// wake-up therefore only tells open pages to try again; if none are open, the page-side runner picks
// the reports up the next time the app is opened.
self.addEventListener('sync', (event) => {
  const sync = event as BackgroundSyncEvent;
  if (sync.tag !== FLUSH_OUTBOX_TAG) return;
  sync.waitUntil(askClientsToFlush());
});

async function askClientsToFlush(): Promise<void> {
  const openPages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const page of openPages) page.postMessage({ type: FLUSH_OUTBOX_MESSAGE });
}
