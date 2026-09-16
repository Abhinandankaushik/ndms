'use client';

import { MapPin } from 'lucide-react';
import { useEffect, useEffectEvent } from 'react';
import { useMap } from 'react-leaflet';
import { AccuracyCircle } from '@/components/map/AccuracyCircle';
import { BaseMap } from '@/components/map/BaseMap';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import type { LatLon } from '@/lib/api/types';
import type { DeviceFix } from './geolocation';

const PIN_ZOOM = 17;

export interface PinPickerMapViewProps {
  initialCenter: LatLon | null;
  /** Drawn for reference; the map recentres whenever a new fix object arrives. */
  fix: DeviceFix | null;
  onCenterChange: (center: LatLon) => void;
}

export function PinPickerMapView({ initialCenter, fix, onCenterChange }: PinPickerMapViewProps) {
  return (
    <div className="absolute inset-0">
      <BaseMap
        className="size-full min-h-0"
        center={initialCenter ? [initialCenter.lat, initialCenter.lon] : undefined}
        zoom={initialCenter ? PIN_ZOOM : undefined}
      >
        <DistrictOutline fitBounds={!initialCenter && !fix} />
        {fix && <AccuracyCircle lat={fix.lat} lon={fix.lon} accuracyM={fix.accuracyM} />}
        <CenterTracker onChange={onCenterChange} />
        <RecenterOnFix fix={fix} />
      </BaseMap>
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <MapPin className="size-11 fill-red-600 stroke-white stroke-[1.5] drop-shadow-md" />
      </div>
    </div>
  );
}

function CenterTracker({ onChange }: { onChange: (center: LatLon) => void }) {
  const map = useMap();
  const report = useEffectEvent(() => {
    const center = map.getCenter().wrap();
    onChange({ lat: center.lat, lon: center.lng });
  });

  useEffect(() => {
    const reportCenter = () => report();
    reportCenter();
    map.on('moveend', reportCenter);
    return () => {
      map.off('moveend', reportCenter);
    };
  }, [map]);

  return null;
}

function RecenterOnFix({ fix }: { fix: DeviceFix | null }) {
  const map = useMap();

  useEffect(() => {
    if (fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), PIN_ZOOM));
  }, [map, fix]);

  return null;
}
