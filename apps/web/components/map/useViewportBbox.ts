'use client';

import type { Map as LeafletMapInstance } from 'leaflet';
import { useEffect, useEffectEvent, useState } from 'react';
import { useMap } from 'react-leaflet';
import type { Bbox } from '@/lib/api/types';

const DEFAULT_DEBOUNCE_MS = 300;
// About 11 m. Rounding outwards keeps query keys stable across sub-pixel pans without dropping edge markers.
const BBOX_SCALE = 10_000;

export interface ViewportBboxOptions {
  debounceMs?: number;
}

/**
 * The visible map area as [minLon, minLat, maxLon, maxLat], ready for a bbox query parameter; updated after the
 * map settles. Null while the map has no size. Call it inside a BaseMap child.
 */
export function useViewportBbox({ debounceMs = DEFAULT_DEBOUNCE_MS }: ViewportBboxOptions = {}): Bbox | null {
  const map = useMap();
  const [bbox, setBbox] = useState<Bbox | null>(() => viewportBbox(map));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = viewportBbox(map);
        setBbox((current) => (sameBbox(current, next) ? current : next));
      }, debounceMs);
    };

    settle();
    map.on('moveend', settle);
    return () => {
      clearTimeout(timer);
      map.off('moveend', settle);
    };
  }, [map, debounceMs]);

  return bbox;
}

export interface ViewportBboxReporterProps extends ViewportBboxOptions {
  onChange: (bbox: Bbox | null) => void;
}

/** Lifts the viewport bbox to state outside the map, where the marker query usually lives. */
export function ViewportBboxReporter({ onChange, debounceMs }: ViewportBboxReporterProps): null {
  const bbox = useViewportBbox({ debounceMs });
  const report = useEffectEvent(onChange);

  useEffect(() => {
    report(bbox);
  }, [bbox]);

  return null;
}

function viewportBbox(map: LeafletMapInstance): Bbox | null {
  const size = map.getSize();
  if (size.x === 0 || size.y === 0) return null;

  const bounds = map.getBounds();
  const minLon = clamp(Math.floor(bounds.getWest() * BBOX_SCALE) / BBOX_SCALE, -180, 180);
  const minLat = clamp(Math.floor(bounds.getSouth() * BBOX_SCALE) / BBOX_SCALE, -90, 90);
  const maxLon = clamp(Math.ceil(bounds.getEast() * BBOX_SCALE) / BBOX_SCALE, -180, 180);
  const maxLat = clamp(Math.ceil(bounds.getNorth() * BBOX_SCALE) / BBOX_SCALE, -90, 90);
  return minLon < maxLon && minLat < maxLat ? [minLon, minLat, maxLon, maxLat] : null;
}

function sameBbox(a: Bbox | null, b: Bbox | null): boolean {
  if (a === null || b === null) return a === b;
  return a.every((value, index) => value === b[index]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
