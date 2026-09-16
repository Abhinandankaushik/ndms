'use client';

import { useState } from 'react';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import { useViewportBbox } from '@/components/map/useViewportBbox';
import type { HeatmapCell } from '@/lib/api/types';
import type { IncidentFilters } from '../overview/incident-filters';
import { useGovtWorkspace } from '../workspace-store';
import { FacilityMarkersLayer } from './FacilityMarkersLayer';
import { MapFocusController, SelectedIncidentHalo } from './FocusLayers';
import { HeatmapLayer, type HeatmapScale } from './HeatmapLayer';
import { IncidentMarkersLayer, type IncidentsShown } from './IncidentMarkersLayer';
import { TeamMarkersLayer } from './TeamMarkersLayer';
import { useMapZoom } from './useMapZoom';

export interface OverviewLayerToggles {
  facilities: boolean;
  teams: boolean;
  heatmap: boolean;
}

export interface OverviewMapLayersProps {
  filters: IncidentFilters;
  layers: OverviewLayerToggles;
  heatmapHours: number;
  onIncidentsShown: (shown: IncidentsShown | null) => void;
  onHeatmapScale: (scale: HeatmapScale | null) => void;
  onHeatmapHover: (cell: HeatmapCell | null) => void;
}

// Everything that imports Leaflet lives below this module, which the overview loads on the client only.
export function OverviewMapLayers({
  filters,
  layers,
  heatmapHours,
  onIncidentsShown,
  onHeatmapScale,
  onHeatmapHover,
}: OverviewMapLayersProps) {
  const bbox = useViewportBbox();
  const zoom = useMapZoom();
  // "Show on map" from another page navigates here with a focus request; framing the district would undo it.
  const [arrivedWithFocus] = useState(() => useGovtWorkspace.getState().mapFocus !== null);

  return (
    <>
      <DistrictOutline fitBounds={!arrivedWithFocus} />
      {bbox && layers.heatmap && (
        <HeatmapLayer bbox={bbox} zoom={zoom} hours={heatmapHours} onScale={onHeatmapScale} onHover={onHeatmapHover} />
      )}
      {bbox && layers.facilities && <FacilityMarkersLayer bbox={bbox} />}
      {bbox && <IncidentMarkersLayer bbox={bbox} zoom={zoom} filters={filters} onShown={onIncidentsShown} />}
      {layers.teams && <TeamMarkersLayer />}
      <SelectedIncidentHalo />
      <MapFocusController />
    </>
  );
}
