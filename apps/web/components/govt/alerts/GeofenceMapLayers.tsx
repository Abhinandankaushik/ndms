'use client';

import type { LatLngTuple, PathOptions } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { CircleMarker, GeoJSON, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import type { Alert, AlertSeverity, LatLon } from '@/lib/api/types';
import { MIN_GEOFENCE_VERTICES, type LatLngBoundsTuple } from './geofence';

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  MINOR: '#0284c7',
  MODERATE: '#d97706',
  SEVERE: '#ea580c',
  EXTREME: '#dc2626',
};

const DRAFT_STYLE: PathOptions = { color: '#0f172a', weight: 3, fillColor: '#0ea5e9', fillOpacity: 0.2 };
const OPEN_PATH_STYLE: PathOptions = { color: '#0f172a', weight: 2, dashArray: '6 6' };
const VERTEX_STYLE: PathOptions = { color: '#0f172a', weight: 2, fillColor: '#ffffff', fillOpacity: 1 };
const FIRST_VERTEX_STYLE: PathOptions = { color: '#0f172a', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 };
const FIT_PADDING: [number, number] = [24, 24];

export interface GeofenceMapLayersProps {
  vertices: readonly LatLon[];
  closed: boolean;
  drawing: boolean;
  onAddVertex: (vertex: LatLon) => void;
  onCloseShape: () => void;
  alerts: readonly Alert[];
  highlightedAlertId: string | null;
  fitRequest: { bounds: LatLngBoundsTuple; requestedAt: number } | null;
}

export function GeofenceMapLayers({
  vertices,
  closed,
  drawing,
  onAddVertex,
  onCloseShape,
  alerts,
  highlightedAlertId,
  fitRequest,
}: GeofenceMapLayersProps) {
  const map = useMap();
  const positions = useMemo<LatLngTuple[]>(() => vertices.map((vertex) => [vertex.lat, vertex.lon]), [vertices]);
  const canClose = !closed && vertices.length >= MIN_GEOFENCE_VERTICES;

  useMapEvents({
    click: (event) => {
      if (drawing && !closed) onAddVertex({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });

  // Double-clicking would zoom as well as drop two vertices.
  useEffect(() => {
    if (!drawing) return;
    const container = map.getContainer();
    map.doubleClickZoom.disable();
    container.style.cursor = 'crosshair';
    return () => {
      map.doubleClickZoom.enable();
      container.style.cursor = '';
    };
  }, [drawing, map]);

  useEffect(() => {
    if (fitRequest) map.fitBounds(fitRequest.bounds, { padding: FIT_PADDING });
  }, [fitRequest, map]);

  return (
    <>
      <DistrictOutline />
      {alerts.map((alert) =>
        alert.geofence ? (
          <GeoJSON
            key={alert.id}
            data={alert.geofence}
            interactive={false}
            style={{
              color: SEVERITY_COLORS[alert.severity],
              weight: alert.id === highlightedAlertId ? 4 : 1.5,
              opacity: alert.id === highlightedAlertId ? 1 : 0.6,
              fillOpacity: alert.id === highlightedAlertId ? 0.25 : 0.08,
            }}
          />
        ) : null,
      )}
      {closed ? (
        <Polygon positions={positions} pathOptions={DRAFT_STYLE} interactive={false} />
      ) : (
        positions.length > 1 && <Polyline positions={positions} pathOptions={OPEN_PATH_STYLE} interactive={false} />
      )}
      {!closed &&
        positions.map((position, index) => (
          <CircleMarker
            key={`${index}:${position[0]}:${position[1]}`}
            center={position}
            radius={index === 0 ? 8 : 5}
            pathOptions={index === 0 ? FIRST_VERTEX_STYLE : VERTEX_STYLE}
            eventHandlers={{
              // Clicking a vertex must not also drop a new one on top of it.
              click: () => {
                if (index === 0 && canClose) onCloseShape();
              },
            }}
          />
        ))}
    </>
  );
}
