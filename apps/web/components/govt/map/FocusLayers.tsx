'use client';

import { useQuery } from '@tanstack/react-query';
import type { LatLngTuple } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { incidentDetailQuery } from '../queries';
import { clearMapFocus, useGovtWorkspace } from '../workspace-store';
import { selectionHaloIcon } from './govt-map-icons';

const FOCUS_MIN_ZOOM = 15;

/** Rings the incident open in the drawer, so the queue selection and the map stay visibly linked. */
export function SelectedIncidentHalo() {
  const incidentId = useGovtWorkspace((state) => state.drawerIncidentId);
  return incidentId ? <IncidentHalo incidentId={incidentId} /> : null;
}

function IncidentHalo({ incidentId }: { incidentId: string }) {
  const { data } = useQuery(incidentDetailQuery(incidentId));
  const lat = data?.lat ?? null;
  const lon = data?.lon ?? null;
  const position = useMemo<LatLngTuple | null>(() => (lat === null || lon === null ? null : [lat, lon]), [lat, lon]);

  if (!position) return null;
  return <Marker position={position} icon={selectionHaloIcon} interactive={false} keyboard={false} zIndexOffset={2_000} />;
}

export function MapFocusController() {
  const map = useMap();
  const focus = useGovtWorkspace((state) => state.mapFocus);

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), FOCUS_MIN_ZOOM), { duration: 0.8 });
    clearMapFocus();
  }, [focus, map]);

  return null;
}
