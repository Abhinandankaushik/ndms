'use client';

import { ChevronDown, Layers, TriangleAlert } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { BaseMap } from '@/components/map/BaseMap';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { HeatmapCell } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { formatCount } from '../lib/format';
import { useIncidentFilters } from '../overview/incident-filters';
import type { HeatmapScale } from './HeatmapLayer';
import { HEATMAP_RAMP, HEATMAP_WINDOWS_HOURS, cellSizeLabel, type HeatmapWindowHours } from './heatmap-scale';
import type { IncidentsShown } from './IncidentMarkersLayer';
import type { OverviewLayerToggles } from './OverviewMapLayers';

const OverviewMapLayers = dynamic(() => import('./OverviewMapLayers').then((module) => module.OverviewMapLayers), {
  ssr: false,
});

const HEATMAP_WINDOW_LABELS: Record<HeatmapWindowHours, string> = {
  6: 'Last 6 hours',
  24: 'Last 24 hours',
  72: 'Last 3 days',
  168: 'Last 7 days',
};

export function OverviewMap({ className }: { className?: string }) {
  const filters = useIncidentFilters();
  const [layers, setLayers] = useState<OverviewLayerToggles>({ facilities: true, teams: true, heatmap: false });
  const [heatmapHours, setHeatmapHours] = useState<HeatmapWindowHours>(24);
  const [incidentsShown, setIncidentsShown] = useState<IncidentsShown | null>(null);
  const [heatmapScale, setHeatmapScale] = useState<HeatmapScale | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const toggleLayer = useCallback((layer: keyof OverviewLayerToggles, visible: boolean) => {
    setLayers((current) => ({ ...current, [layer]: visible }));
  }, []);

  return (
    <div className={cn('relative overflow-hidden rounded-xl border', className)}>
      <BaseMap className="size-full min-h-0">
        <OverviewMapLayers
          filters={filters}
          layers={layers}
          heatmapHours={heatmapHours}
          onIncidentsShown={setIncidentsShown}
          onHeatmapScale={setHeatmapScale}
          onHeatmapHover={setHoveredCell}
        />
      </BaseMap>

      <LayerControls
        className="absolute top-3 right-3 z-10"
        layers={layers}
        onToggle={toggleLayer}
        heatmapHours={heatmapHours}
        onHeatmapHoursChange={setHeatmapHours}
      />
      <MapLegend
        className="absolute bottom-6 left-3 z-10"
        layers={layers}
        incidentsShown={incidentsShown}
        heatmapScale={layers.heatmap ? heatmapScale : null}
        hoveredCell={layers.heatmap ? hoveredCell : null}
      />
    </div>
  );
}

function LayerControls({
  layers,
  onToggle,
  heatmapHours,
  onHeatmapHoursChange,
  className,
}: {
  layers: OverviewLayerToggles;
  onToggle: (layer: keyof OverviewLayerToggles, visible: boolean) => void;
  heatmapHours: HeatmapWindowHours;
  onHeatmapHoursChange: (hours: HeatmapWindowHours) => void;
  className?: string;
}) {
  const idPrefix = useId();
  const toggles: { layer: keyof OverviewLayerToggles; label: string }[] = [
    { layer: 'facilities', label: 'Shelters & hospitals' },
    { layer: 'teams', label: 'Rescue teams' },
    { layer: 'heatmap', label: 'Incident heatmap' },
  ];

  return (
    <fieldset className={cn('grid gap-2 rounded-lg border bg-background/95 p-3 text-sm shadow-md backdrop-blur', className)}>
      <legend className="sr-only">Map layers</legend>
      <p aria-hidden className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Layers className="size-3.5" />
        Layers
      </p>
      {toggles.map(({ layer, label }) => (
        <div key={layer} className="flex items-center justify-between gap-3">
          <Label htmlFor={`${idPrefix}-${layer}`} className="font-normal">
            {label}
          </Label>
          <Switch
            id={`${idPrefix}-${layer}`}
            checked={layers[layer]}
            onCheckedChange={(checked) => onToggle(layer, checked)}
          />
        </div>
      ))}
      {layers.heatmap && (
        <Select value={String(heatmapHours)} onValueChange={(value) => onHeatmapHoursChange(Number(value) as HeatmapWindowHours)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Heatmap time window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEATMAP_WINDOWS_HOURS.map((hours) => (
              <SelectItem key={hours} value={String(hours)}>
                {HEATMAP_WINDOW_LABELS[hours]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </fieldset>
  );
}

const INCIDENT_LEGEND = [
  { label: 'Reported', swatch: 'bg-red-600' },
  { label: 'Verified', swatch: 'bg-orange-500' },
  { label: 'Team assigned', swatch: 'bg-blue-600' },
  { label: 'In progress', swatch: 'bg-violet-600' },
  { label: 'Resolved', swatch: 'bg-emerald-600' },
  { label: 'Rejected', swatch: 'bg-zinc-500' },
] as const;

const FACILITY_LEGEND = [
  { label: 'Under 60 % full', swatch: 'bg-emerald-600' },
  { label: '60–85 % full', swatch: 'bg-amber-500' },
  { label: '85 % or more', swatch: 'bg-red-600' },
  { label: 'Closed', swatch: 'bg-zinc-400' },
] as const;

function MapLegend({
  layers,
  incidentsShown,
  heatmapScale,
  hoveredCell,
  className,
}: {
  layers: OverviewLayerToggles;
  incidentsShown: IncidentsShown | null;
  heatmapScale: HeatmapScale | null;
  hoveredCell: HeatmapCell | null;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <div className={cn('max-w-64 rounded-lg border bg-background/95 text-xs shadow-md backdrop-blur', className)}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span>{incidentsShown ? `${formatCount(incidentsShown.count)} incidents in view` : 'Loading incidents…'}</span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {incidentsShown?.truncated && (
        <p className="flex items-start gap-1.5 px-3 pb-2 text-amber-800">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          Only the first {formatCount(incidentsShown.limit)} incidents in this area are loaded. Zoom in to see every one.
        </p>
      )}
      {expanded && (
        <div id={contentId} className="grid gap-3 border-t px-3 py-2">
          <LegendGroup title="Incidents">
            {INCIDENT_LEGEND.map(({ label, swatch }) => (
              <LegendItem key={label} label={label} swatch={<span className={cn('size-2.5 rounded-full', swatch)} />} />
            ))}
            <LegendItem label="SOS (larger, red ring)" swatch={<span className="size-3 rounded-full bg-red-600 ring-2 ring-red-300" />} />
          </LegendGroup>
          {layers.facilities && (
            <LegendGroup title="Shelters & hospitals">
              {FACILITY_LEGEND.map(({ label, swatch }) => (
                <LegendItem key={label} label={label} swatch={<span className={cn('size-2.5 rounded-sm', swatch)} />} />
              ))}
            </LegendGroup>
          )}
          {layers.teams && (
            <LegendGroup title="Rescue teams">
              <LegendItem label="Available" swatch={<span className="size-2.5 rounded-sm bg-slate-900 ring-2 ring-emerald-400" />} />
              <LegendItem label="Busy" swatch={<span className="size-2.5 rounded-sm bg-slate-900 ring-2 ring-amber-400" />} />
              <LegendItem label="Faded: position over 15 min old" swatch={<span className="size-2.5 rounded-sm bg-slate-900 opacity-50" />} />
            </LegendGroup>
          )}
          {heatmapScale && <HeatmapLegend scale={heatmapScale} hoveredCell={hoveredCell} />}
        </div>
      )}
    </div>
  );
}

function HeatmapLegend({ scale, hoveredCell }: { scale: HeatmapScale; hoveredCell: HeatmapCell | null }) {
  return (
    <LegendGroup title={`Open incidents per ${cellSizeLabel(scale.cellDegrees)} cell`}>
      <li className="grid gap-1">
        <span aria-hidden className="flex h-2.5 overflow-hidden rounded-sm">
          {HEATMAP_RAMP.map((color) => (
            <span key={color} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </span>
        <span className="flex justify-between text-muted-foreground">
          <span>1</span>
          <span>{scale.maxCount > 0 ? formatCount(scale.maxCount) : '–'}</span>
        </span>
      </li>
      <li role="status" className="text-muted-foreground">
        {hoveredCell ? (
          <>
            <span className="font-semibold text-foreground">{formatCount(hoveredCell.count)}</span>{' '}
            {hoveredCell.count === 1 ? 'incident' : 'incidents'}
            {hoveredCell.avgPriority !== null && ` · average priority ${Math.round(hoveredCell.avgPriority)}`}
          </>
        ) : scale.cellCount === 0 ? (
          'No open incidents in this window'
        ) : (
          'Point at a cell for its count'
        )}
      </li>
    </LegendGroup>
  );
}

function LegendGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="font-medium">{title}</p>
      <ul className="grid gap-1">{children}</ul>
    </div>
  );
}

function LegendItem({ label, swatch }: { label: string; swatch: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-muted-foreground">
      <span aria-hidden className="flex size-3 items-center justify-center">
        {swatch}
      </span>
      {label}
    </li>
  );
}
