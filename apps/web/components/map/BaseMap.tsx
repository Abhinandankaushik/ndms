'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LeafletMapProps } from './LeafletMap';

// Leaflet touches window and document while its module loads, so the map never renders on the server.
// Layers passed as children import Leaflet too: build them in a module that is itself loaded with
// next/dynamic and ssr: false.
const LeafletMap = dynamic(() => import('./LeafletMap').then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

export interface BaseMapProps extends LeafletMapProps {
  /** Sizes the map; give it a height (h-80, flex-1 in a sized column, ...). */
  className?: string;
}

export function BaseMap({ className, ...mapProps }: BaseMapProps) {
  return (
    // isolate scopes Leaflet's pane and control z-indexes (400-1000) so they cannot cover the header, sheets or dialogs.
    <div className={cn('relative isolate min-h-48 overflow-hidden bg-muted', className)}>
      <LeafletMap {...mapProps} />
    </div>
  );
}
