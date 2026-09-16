'use client';

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

/** The map's zoom level after each zoom settles. Call it inside a BaseMap child. */
export function useMapZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  return zoom;
}
