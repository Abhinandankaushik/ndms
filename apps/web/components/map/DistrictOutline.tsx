'use client';

import { useQuery } from '@tanstack/react-query';
import type { PathOptions } from 'leaflet';
import { useEffect, useRef } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import { getMyDistrict } from '@/lib/api/endpoints/districts';
import { queryKeys } from '@/lib/api/query-keys';

const OUTLINE_STYLE: PathOptions = { color: '#334155', weight: 2, opacity: 0.8, dashArray: '6 6', fill: false };
const FIT_PADDING_PX: [number, number] = [16, 16];

export interface DistrictOutlineProps {
  /** Frame the district when its boundary first loads. */
  fitBounds?: boolean;
}

export function DistrictOutline({ fitBounds = true }: DistrictOutlineProps) {
  const map = useMap();
  const fittedDistrictId = useRef<number | null>(null);
  const { data: district } = useQuery({
    queryKey: queryKeys.districts.mine,
    queryFn: ({ signal }) => getMyDistrict({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!district || !fitBounds || fittedDistrictId.current === district.id) return;
    fittedDistrictId.current = district.id;
    const [minLon, minLat, maxLon, maxLat] = district.bbox;
    map.fitBounds(
      [
        [minLat, minLon],
        [maxLat, maxLon],
      ],
      { padding: FIT_PADDING_PX },
    );
  }, [district, fitBounds, map]);

  if (!district) return null;
  return <GeoJSON key={district.id} data={district.boundary} style={OUTLINE_STYLE} interactive={false} />;
}
