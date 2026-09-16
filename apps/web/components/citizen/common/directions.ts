import type { LatLon } from '@/lib/api/types';

export function directionsUrl({ lat, lon }: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
