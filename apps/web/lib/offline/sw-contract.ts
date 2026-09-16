// The only names shared between the page and the service worker. app/sw.ts imports this file
// relatively, so it resolves without the "@/" alias inside Serwist's separate worker build.

export const FLUSH_OUTBOX_TAG = 'ndms-flush-outbox';
export const FLUSH_OUTBOX_MESSAGE = 'ndms:flush-outbox';

export const API_CACHE_NAME = 'ndms-api';
export const TILE_CACHE_NAME = 'ndms-osm-tiles';

/** OSM's tile policy forbids bulk downloading, so only tiles already viewed are kept, and not many. */
export const MAX_CACHED_TILES = 300;
