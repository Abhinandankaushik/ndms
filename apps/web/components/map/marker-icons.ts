import L from 'leaflet';
import {
  OPEN_INCIDENT_STATUSES,
  type DisasterType,
  type IncidentStatus,
} from '@/lib/api/types';

export const SOS_MARKER_CLASS = 'ndms-sos-marker';

const MARKER_SIZE_PX = 28;
const SOS_MARKER_SIZE_PX = 36;

// Stroke paths from Lucide (ISC licence, https://lucide.dev): waves-horizontal, activity, flame, tornado,
// mountain, building-complex and triangle-alert. Inlined because a divIcon takes an HTML string, not a component.
const TYPE_GLYPH_PATHS: Record<DisasterType, readonly string[]> = {
  FLOOD: ['M2 12q2.5 2 5 0t5 0 5 0 5 0', 'M2 19q2.5 2 5 0t5 0 5 0 5 0', 'M2 5q2.5 2 5 0t5 0 5 0 5 0'],
  EARTHQUAKE: [
    'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
  ],
  FIRE: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'],
  CYCLONE: ['M21 4H3', 'M18 8H6', 'M19 12H9', 'M16 16h-6', 'M11 20H9'],
  LANDSLIDE: ['m8 3 4 8 5-5 5 15H2L8 3z'],
  BUILDING_COLLAPSE: [
    'M10 12h4',
    'M10 8h4',
    'M14 21v-3a2 2 0 0 0-4 0v3',
    'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2',
    'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16',
  ],
  OTHER: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
};

const STATUS_FILL_CLASS: Record<IncidentStatus, string> = {
  REPORTED: 'bg-red-600',
  VERIFIED: 'bg-orange-500',
  ASSIGNED: 'bg-blue-600',
  IN_PROGRESS: 'bg-violet-600',
  RESOLVED: 'bg-emerald-600',
  REJECTED_DUPLICATE: 'bg-zinc-500',
  REJECTED_FAKE: 'bg-zinc-500',
};

export interface IncidentIconVariant {
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
}

const incidentIconCache = new Map<string, L.DivIcon>();

// Icons are shared per variant: react-leaflet calls setIcon whenever the icon prop changes identity, so a fresh
// icon per render would redraw every marker on the map.
export function incidentIcon({ type, status, isSos }: IncidentIconVariant): L.DivIcon {
  const key = `${type}:${status}:${isSos}`;
  let icon = incidentIconCache.get(key);
  if (!icon) {
    icon = createIncidentIcon(type, status, isSos);
    incidentIconCache.set(key, icon);
  }
  return icon;
}

function createIncidentIcon(type: DisasterType, status: IncidentStatus, isSos: boolean): L.DivIcon {
  const size = isSos ? SOS_MARKER_SIZE_PX : MARKER_SIZE_PX;
  const isOpen = OPEN_INCIDENT_STATUSES.includes(status);
  const halo = isSos && isOpen ? '<span class="absolute inset-0 animate-ping rounded-full bg-red-500/60"></span>' : '';
  const sosRing = isSos ? ' ring-2 ring-red-600' : '';
  return L.divIcon({
    className: isSos ? `ndms-incident-marker ${SOS_MARKER_CLASS}` : 'ndms-incident-marker',
    html:
      `<span class="relative flex size-full items-center justify-center">${halo}` +
      `<span class="relative flex size-full items-center justify-center rounded-full border-2 border-white text-white shadow-md ${STATUS_FILL_CLASS[status]}${sosRing}">` +
      `${glyphSvg(TYPE_GLYPH_PATHS[type], isSos ? 'size-5' : 'size-4')}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    tooltipAnchor: [size / 2, 0],
  });
}

function glyphSvg(paths: readonly string[], sizeClass: 'size-4' | 'size-5'): string {
  const body = paths.map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${sizeClass}" aria-hidden="true">${body}</svg>`;
}

export function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : count < 1000 ? 44 : 52;
  const sosRing = cluster.getAllChildMarkers().some(isSosMarker) ? ' ring-2 ring-red-600 ring-offset-1' : '';
  return L.divIcon({
    className: 'ndms-cluster-marker',
    html: `<span class="flex size-full items-center justify-center rounded-full border-2 border-white bg-slate-900/85 text-xs font-semibold text-white shadow-md${sosRing}">${formatClusterCount(count)}</span>`,
    iconSize: [size, size],
  });
}

function isSosMarker(marker: L.Marker): boolean {
  const className = marker.options.icon?.options.className;
  return typeof className === 'string' && className.split(' ').includes(SOS_MARKER_CLASS);
}

function formatClusterCount(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
}

// Leaflet's stock marker locates its PNGs by parsing a CSS url that bundlers rewrite, so it renders broken
// images; every marker without an explicit icon uses this inline one instead.
export const defaultMarkerIcon = L.divIcon({
  className: 'ndms-default-marker',
  html: '<span class="block size-full rounded-full border-[3px] border-white bg-blue-600 shadow-md"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
  tooltipAnchor: [10, 0],
});
