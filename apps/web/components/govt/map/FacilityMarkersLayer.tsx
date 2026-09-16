'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LatLngTuple } from 'leaflet';
import { memo, useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import type { Bbox, Facility } from '@/lib/api/types';
import { FACILITY_KIND_LABELS } from '@/lib/labels';
import { utilisationLabel } from '../lib/bands';
import { formatCount, formatPercent } from '../lib/format';
import { facilitiesInBboxQuery } from '../queries';
import { facilityIcon } from './govt-map-icons';

// Incidents are what officials act on, so facilities sit underneath them when they overlap.
const FACILITY_Z_OFFSET = -1_000;

export function FacilityMarkersLayer({ bbox }: { bbox: Bbox }) {
  const { data } = useQuery({ ...facilitiesInBboxQuery(bbox), placeholderData: keepPreviousData, staleTime: 60_000 });
  return <>{data?.map((facility) => <FacilityMarker key={facility.id} facility={facility} />)}</>;
}

const FacilityMarker = memo(function FacilityMarker({ facility }: { facility: Facility }) {
  const position = useMemo<LatLngTuple>(() => [facility.lat, facility.lon], [facility.lat, facility.lon]);
  const title = `${FACILITY_KIND_LABELS[facility.kind]}: ${facility.name}`;

  return (
    <Marker position={position} icon={facilityIcon(facility)} title={title} alt={title} zIndexOffset={FACILITY_Z_OFFSET}>
      <Tooltip direction="top" offset={[0, -8]}>
        <div className="grid gap-0.5 text-xs">
          <span className="font-semibold">{facility.name}</span>
          <span>{FACILITY_KIND_LABELS[facility.kind]}</span>
          {facility.isOperational ? (
            <span>
              {formatCount(facility.occupancy)} / {formatCount(facility.capacity)} · {formatPercent(facility.utilisation)} ·{' '}
              {utilisationLabel(facility.utilisation)}
            </span>
          ) : (
            <span>Not operational</span>
          )}
        </div>
      </Tooltip>
    </Marker>
  );
});
