'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo } from 'react';
import { AccuracyCircle } from '@/components/map/AccuracyCircle';
import { IncidentMarker } from '@/components/map/IncidentMarker';
import { MarkerCluster } from '@/components/map/MarkerCluster';
import type { Bbox, MapMarkerQuery } from '@/lib/api/types';
import type { IncidentFilters } from '../overview/incident-filters';
import { incidentMarkersQuery } from '../queries';
import { openIncident } from '../workspace-store';

// O3 is measured with 5,000 incidents on screen, so the map asks for the API's maximum rather than its default.
export const MARKER_LIMIT = 5_000;
// Below street level an accuracy circle is a few pixels wide and only adds clutter.
const ACCURACY_MIN_ZOOM = 16;
const MAX_ACCURACY_CIRCLES = 300;

export interface IncidentsShown {
  /** Markers actually drawn, after the client-side SOS filter. */
  count: number;
  truncated: boolean;
  /** The server's ceiling, which is what a truncated viewport was cut to. */
  limit: number;
}

export function IncidentMarkersLayer({
  bbox,
  zoom,
  filters,
  onShown,
}: {
  bbox: Bbox;
  zoom: number;
  filters: IncidentFilters;
  onShown: (shown: IncidentsShown | null) => void;
}) {
  const query = useMemo<MapMarkerQuery>(
    () => ({ bbox, status: filters.statuses, type: filters.types, limit: MARKER_LIMIT }),
    [bbox, filters.statuses, filters.types],
  );
  const { data } = useQuery({ ...incidentMarkersQuery(query), placeholderData: keepPreviousData });

  // The markers endpoint has no SOS filter; the list is already bounded by the viewport and the limit.
  const markers = useMemo(() => (filters.sosOnly ? data?.filter((marker) => marker.isSos) : data), [data, filters.sosOnly]);

  const report = useEffectEvent(onShown);
  useEffect(() => {
    report(data ? { count: markers?.length ?? 0, truncated: data.length >= MARKER_LIMIT, limit: MARKER_LIMIT } : null);
  }, [data, markers]);
  useEffect(() => () => report(null), []);

  const circles = useMemo(
    () =>
      zoom >= ACCURACY_MIN_ZOOM
        ? (markers ?? []).filter((marker) => marker.accuracyM !== null && marker.accuracyM > 0).slice(0, MAX_ACCURACY_CIRCLES)
        : [],
    [markers, zoom],
  );

  return (
    <>
      <MarkerCluster>
        {markers?.map((marker) => (
          <IncidentMarker key={marker.id} incident={marker} onSelect={openIncident} />
        ))}
      </MarkerCluster>
      {circles.map((marker) => (
        <AccuracyCircle key={marker.id} lat={marker.lat} lon={marker.lon} accuracyM={marker.accuracyM} showPosition={false} />
      ))}
    </>
  );
}
