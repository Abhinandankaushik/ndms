'use client';

import dynamic from 'next/dynamic';
import { BaseMap } from '@/components/map/BaseMap';
import { cn } from '@/lib/utils';
import type { GeofenceMapLayersProps } from './GeofenceMapLayers';

const GeofenceMapLayers = dynamic(() => import('./GeofenceMapLayers').then((module) => module.GeofenceMapLayers), {
  ssr: false,
});

export function GeofenceMap({ className, ...layers }: GeofenceMapLayersProps & { className?: string }) {
  return (
    <BaseMap className={cn('rounded-xl border', className)}>
      <GeofenceMapLayers {...layers} />
    </BaseMap>
  );
}
