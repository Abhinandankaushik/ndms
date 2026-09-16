'use client';

import L, { type LatLngBoundsLiteral, type LatLngTuple } from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import { directionsUrl } from '@/components/citizen/common/directions';
import { formatCount, formatDistance } from '@/components/citizen/common/format';
import { AccuracyCircle } from '@/components/map/AccuracyCircle';
import { BaseMap } from '@/components/map/BaseMap';
import type { LatLon, NearbyFacility } from '@/lib/api/types';
import { NEARLY_FULL_UTILISATION } from './ShelterCard';

const ORIGIN_ONLY_ZOOM = 14;
const MARKER_SIZE_PX = 36;

export interface ShelterMapOrigin extends LatLon {
  accuracyM: number | null;
}

export interface ShelterMapViewProps {
  shelters: readonly NearbyFacility[];
  origin: ShelterMapOrigin;
}

export function ShelterMapView({ shelters, origin }: ShelterMapViewProps) {
  const bounds = boundsFor(origin, shelters);
  const viewKey = `${origin.lat},${origin.lon}:${shelters.map((shelter) => shelter.id).join(',')}`;

  return (
    <BaseMap
      key={viewKey}
      className="h-[60dvh] min-h-80 rounded-xl border-2"
      bounds={bounds ?? undefined}
      center={bounds ? undefined : [origin.lat, origin.lon]}
      zoom={bounds ? undefined : ORIGIN_ONLY_ZOOM}
    >
      <AccuracyCircle lat={origin.lat} lon={origin.lon} accuracyM={origin.accuracyM} />
      {shelters.map((shelter) => (
        <Marker
          key={shelter.id}
          position={[shelter.lat, shelter.lon]}
          icon={shelterIcon(shelter)}
          title={`${shelter.name}: space for ${shelter.freeCapacity}`}
        >
          <Popup>
            <div className="grid gap-1 text-sm">
              <p className="text-base font-bold">{shelter.name}</p>
              <p>
                Space for {formatCount(shelter.freeCapacity)} · {formatDistance(shelter.distanceM)} away
              </p>
              <a href={directionsUrl(shelter)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Directions
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </BaseMap>
  );
}

function boundsFor(origin: LatLon, shelters: readonly NearbyFacility[]): LatLngBoundsLiteral | null {
  if (shelters.length === 0) return null;
  const points: LatLngTuple[] = [[origin.lat, origin.lon], ...shelters.map((shelter): LatLngTuple => [shelter.lat, shelter.lon])];
  const lats = points.map(([lat]) => lat);
  const lons = points.map(([, lon]) => lon);
  const latitudePadding = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.1, 0.002);
  const longitudePadding = Math.max((Math.max(...lons) - Math.min(...lons)) * 0.1, 0.002);
  return [
    [Math.min(...lats) - latitudePadding, Math.min(...lons) - longitudePadding],
    [Math.max(...lats) + latitudePadding, Math.max(...lons) + longitudePadding],
  ];
}

const shelterIconCache = new Map<string, L.DivIcon>();

// The marker shows the free places themselves, so the map answers "where is there room" without opening popups.
function shelterIcon(shelter: NearbyFacility): L.DivIcon {
  const tone = shelter.utilisation >= NEARLY_FULL_UTILISATION ? 'nearly-full' : 'open';
  const label = shelter.freeCapacity > 999 ? '999+' : String(shelter.freeCapacity);
  const key = `${tone}:${label}`;
  let icon = shelterIconCache.get(key);
  if (!icon) {
    const fill = tone === 'nearly-full' ? 'bg-amber-600' : 'bg-emerald-700';
    icon = L.divIcon({
      className: 'ndms-shelter-marker',
      html: `<span class="flex size-full items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md ${fill}">${label}</span>`,
      iconSize: [MARKER_SIZE_PX, MARKER_SIZE_PX],
      iconAnchor: [MARKER_SIZE_PX / 2, MARKER_SIZE_PX / 2],
      popupAnchor: [0, -MARKER_SIZE_PX / 2],
    });
    shelterIconCache.set(key, icon);
  }
  return icon;
}
