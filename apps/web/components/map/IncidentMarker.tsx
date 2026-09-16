'use client';

import type { LatLngTuple, LeafletEventHandlerFnMap } from 'leaflet';
import { memo, useMemo, type ReactNode } from 'react';
import { Marker } from 'react-leaflet';
import type { MapMarker } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS, INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { incidentIcon } from './marker-icons';

export interface IncidentMarkerProps {
  incident: Pick<MapMarker, 'id' | 'type' | 'status' | 'isSos' | 'lat' | 'lon'>;
  /** Keep it referentially stable (useCallback) so thousands of markers are not re-bound on every render. */
  onSelect?: (incidentId: string) => void;
  /**
   * A react-leaflet Popup or Tooltip. A new element on every render defeats the memoisation, so for thousands of
   * markers prefer onSelect and one shared panel.
   */
  children?: ReactNode;
}

// react-leaflet compares position and icon by reference and moves or redraws the marker when either changes,
// so both are kept stable and unchanged incidents skip rendering altogether.
export const IncidentMarker = memo(function IncidentMarker({ incident, onSelect, children }: IncidentMarkerProps) {
  const { id, type, status, isSos, lat, lon } = incident;
  const position = useMemo<LatLngTuple>(() => [lat, lon], [lat, lon]);
  const eventHandlers = useMemo<LeafletEventHandlerFnMap | undefined>(
    () =>
      onSelect
        ? {
            click: () => onSelect(id),
            keypress: (event) => {
              if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') onSelect(id);
            },
          }
        : undefined,
    [onSelect, id],
  );
  const title = `${isSos ? 'SOS · ' : ''}${DISASTER_TYPE_LABELS[type]} · ${INCIDENT_STATUS_LABELS[status]}`;

  return (
    <Marker
      position={position}
      icon={incidentIcon({ type, status, isSos })}
      title={title}
      zIndexOffset={isSos ? 1000 : 0}
      eventHandlers={eventHandlers}
    >
      {children}
    </Marker>
  );
});
