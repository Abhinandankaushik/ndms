'use client';

import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';
import type { Bbox, HeatmapCell } from '@/lib/api/types';
import { heatmapQuery } from '../queries';
import { HEATMAP_FILL_OPACITY, heatmapCellDegrees, heatmapColor } from './heatmap-scale';

export interface HeatmapScale {
  maxCount: number;
  cellCount: number;
  cellDegrees: number;
}

interface ShownCells {
  cells: HeatmapCell[];
  cellDegrees: number;
}

// Up to 5,000 cells: drawn imperatively on one canvas, because a React component per rectangle would re-mount
// thousands of layers on every zoom.
export function HeatmapLayer({
  bbox,
  zoom,
  hours,
  onScale,
  onHover,
}: {
  bbox: Bbox;
  zoom: number;
  hours: number;
  onScale: (scale: HeatmapScale | null) => void;
  onHover: (cell: HeatmapCell | null) => void;
}) {
  const map = useMap();
  const cellDegrees = heatmapCellDegrees(zoom);
  const query = useMemo(() => ({ bbox, hours, cellDegrees }), [bbox, hours, cellDegrees]);
  const { data } = useQuery(heatmapQuery(query));
  const [renderer] = useState(() => L.canvas({ padding: 0.2 }));
  // The previous grid stays on screen until the new one arrives, drawn with the cell size it was fetched for.
  const [shown, setShown] = useState<ShownCells | null>(null);

  const reportScale = useEffectEvent(onScale);
  const reportHover = useEffectEvent(onHover);

  useEffect(() => {
    if (data) setShown({ cells: data, cellDegrees });
  }, [data, cellDegrees]);

  useEffect(() => {
    if (!shown) return;
    const maxCount = shown.cells.reduce((max, cell) => Math.max(max, cell.count), 0);
    const half = shown.cellDegrees / 2;
    const group = L.featureGroup();
    for (const cell of shown.cells) {
      L.rectangle(
        [
          [cell.lat - half, cell.lon - half],
          [cell.lat + half, cell.lon + half],
        ],
        { renderer, stroke: false, fillColor: heatmapColor(cell.count, maxCount), fillOpacity: HEATMAP_FILL_OPACITY },
      )
        .on('mouseover', () => reportHover(cell))
        .on('mouseout', () => reportHover(null))
        .addTo(group);
    }
    group.addTo(map);
    reportScale({ maxCount, cellCount: shown.cells.length, cellDegrees: shown.cellDegrees });
    return () => {
      group.remove();
      reportHover(null);
    };
  }, [map, renderer, shown]);

  useEffect(
    () => () => {
      renderer.remove();
      reportScale(null);
    },
    [renderer],
  );

  return null;
}
