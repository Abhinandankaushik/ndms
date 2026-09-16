'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L, { type LatLngBoundsExpression, type LatLngExpression, type LatLngTuple } from 'leaflet';
import { useEffect, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { defaultMarkerIcon } from './marker-icons';

L.Marker.prototype.options.icon = defaultMarkerIcon;

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OSM_MAX_ZOOM = 19;

const INDIA_CENTER: LatLngTuple = [22.5, 80];
const INDIA_ZOOM = 5;
const POINT_ZOOM = 14;

export interface LeafletMapProps {
  /** Initial view only; move the map afterwards with useMap() inside a child. */
  center?: LatLngExpression;
  zoom?: number;
  /** Initial view only; takes precedence over center and zoom. */
  bounds?: LatLngBoundsExpression;
  minZoom?: number;
  maxZoom?: number;
  scrollWheelZoom?: boolean;
  zoomControl?: boolean;
  children?: ReactNode;
}

export function LeafletMap({
  center,
  zoom,
  bounds,
  minZoom = 4,
  maxZoom = OSM_MAX_ZOOM,
  scrollWheelZoom = true,
  zoomControl = true,
  children,
}: LeafletMapProps) {
  const initialView = bounds
    ? { bounds }
    : { center: center ?? INDIA_CENTER, zoom: zoom ?? (center ? POINT_ZOOM : INDIA_ZOOM) };

  return (
    <MapContainer
      {...initialView}
      minZoom={minZoom}
      maxZoom={maxZoom}
      scrollWheelZoom={scrollWheelZoom}
      zoomControl={zoomControl}
      className="absolute inset-0"
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={OSM_MAX_ZOOM} crossOrigin="anonymous" />
      <InvalidateSizeOnResize />
      {children}
    </MapContainer>
  );
}

// Leaflet only listens for window resizes; a panel or sheet opening beside the map resizes its container
// without one and leaves grey, untiled strips.
function InvalidateSizeOnResize() {
  const map = useMap();

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}
