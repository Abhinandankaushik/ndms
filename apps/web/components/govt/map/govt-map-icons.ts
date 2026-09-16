import L from 'leaflet';
import type { FacilityKind } from '@/lib/api/types';
import { utilisationBand, type UtilisationBand } from '../lib/bands';

// Glyph markup from Lucide (ISC licence, https://lucide.dev): house, cross and truck. A divIcon takes an HTML
// string, so only these fixed literals go into it; names and other API text stay in React tooltips, never in HTML.
// Tailwind only generates classes it finds written out whole, so every class below is a complete literal.
const FACILITY_GLYPHS: Record<FacilityKind, string> = {
  SHELTER:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  HOSPITAL:
    '<path d="M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z"/>',
};

const TRUCK_GLYPH =
  '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>';

type FacilityTone = UtilisationBand | 'closed';

const FACILITY_FILL: Record<FacilityTone, string> = {
  good: 'bg-emerald-600',
  warning: 'bg-amber-500',
  critical: 'bg-red-600',
  closed: 'bg-zinc-400',
};

const FACILITY_ICON_PX = 26;
const TEAM_ICON_PX = 30;
const SELECTION_HALO_PX = 60;

function glyph(markup: string, sizeClass: 'size-3.5' | 'size-4'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${sizeClass}" aria-hidden="true">${markup}</svg>`;
}

const facilityIconCache = new Map<string, L.DivIcon>();

// Shared per variant so react-leaflet does not redraw every facility whenever the list refetches.
export function facilityIcon({
  kind,
  utilisation,
  isOperational,
}: {
  kind: FacilityKind;
  utilisation: number;
  isOperational: boolean;
}): L.DivIcon {
  const tone: FacilityTone = isOperational ? utilisationBand(utilisation) : 'closed';
  const key = `${kind}:${tone}`;
  let icon = facilityIconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: 'ndms-facility-marker',
      html: `<span class="flex size-full items-center justify-center rounded-md border-2 border-white text-white shadow-md ${FACILITY_FILL[tone]}">${glyph(FACILITY_GLYPHS[kind], 'size-3.5')}</span>`,
      iconSize: [FACILITY_ICON_PX, FACILITY_ICON_PX],
      iconAnchor: [FACILITY_ICON_PX / 2, FACILITY_ICON_PX / 2],
      tooltipAnchor: [FACILITY_ICON_PX / 2, 0],
    });
    facilityIconCache.set(key, icon);
  }
  return icon;
}

const teamIconCache = new Map<string, L.DivIcon>();

export function teamIcon({ isAvailable, isStale }: { isAvailable: boolean; isStale: boolean }): L.DivIcon {
  const key = `${isAvailable}:${isStale}`;
  let icon = teamIconCache.get(key);
  if (!icon) {
    const ring = isAvailable ? 'ring-emerald-400' : 'ring-amber-400';
    const fade = isStale ? ' opacity-60' : '';
    icon = L.divIcon({
      className: 'ndms-team-marker',
      html: `<span class="flex size-full items-center justify-center rounded-lg border-2 border-white bg-slate-900 text-white shadow-md ring-2 ${ring}${fade}">${glyph(TRUCK_GLYPH, 'size-4')}</span>`,
      iconSize: [TEAM_ICON_PX, TEAM_ICON_PX],
      iconAnchor: [TEAM_ICON_PX / 2, TEAM_ICON_PX / 2],
      tooltipAnchor: [TEAM_ICON_PX / 2, 0],
    });
    teamIconCache.set(key, icon);
  }
  return icon;
}

export const selectionHaloIcon = L.divIcon({
  className: 'ndms-selection-halo',
  html: '<span class="block size-full animate-pulse rounded-full border-4 border-sky-500 bg-sky-400/20"></span>',
  iconSize: [SELECTION_HALO_PX, SELECTION_HALO_PX],
  iconAnchor: [SELECTION_HALO_PX / 2, SELECTION_HALO_PX / 2],
});

export const pinIcon = L.divIcon({
  className: 'ndms-pin-marker',
  html: '<span class="block size-full rounded-full border-4 border-white bg-sky-600 shadow-lg ring-2 ring-sky-600"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
