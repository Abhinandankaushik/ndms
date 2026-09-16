'use client';

import { Building2, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Facility, LatLon } from '@/lib/api/types';
import { distanceMetres, formatCoordinates, formatDistance } from './format';

// react-leaflet touches window while its module loads, so the picker map is only ever loaded in the browser.
const TaskLocationMap = dynamic(() => import('./TaskLocationMap').then((module) => module.TaskLocationMap), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-lg" />,
});

export interface TaskLocationFieldProps {
  facility: Facility;
  /** null means the facility itself. */
  value: LatLon | null;
  onChange: (value: LatLon | null) => void;
  disabled?: boolean;
}

export function TaskLocationField({ facility, value, onChange, disabled = false }: TaskLocationFieldProps) {
  const labelId = useId();
  const isAtFacility = value === null;

  return (
    <div role="group" aria-labelledby={labelId} className="grid min-w-0 gap-3">
      <p id={labelId} className="text-sm font-medium">
        Where volunteers should go
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={isAtFacility ? 'default' : 'outline'}
          className="h-11"
          aria-pressed={isAtFacility}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <Building2 aria-hidden />
          This facility
        </Button>
        <Button
          type="button"
          variant={isAtFacility ? 'outline' : 'default'}
          className="h-11"
          aria-pressed={!isAtFacility}
          disabled={disabled}
          onClick={() => onChange(value ?? { lat: facility.lat, lon: facility.lon })}
        >
          <MapPin aria-hidden />
          Somewhere else
        </Button>
      </div>
      {isAtFacility ? (
        <p className="text-sm text-muted-foreground">
          {facility.name}
          {facility.address ? `, ${facility.address}` : ` (${formatCoordinates(facility)})`}
        </p>
      ) : (
        <>
          <TaskLocationMap facility={facility} point={value} onPointChange={onChange} />
          <p className="text-xs text-muted-foreground">
            Tap the map or drag the pin. {formatCoordinates(value)}, {formatDistance(distanceMetres(facility, value))}{' '}
            from the facility.
          </p>
        </>
      )}
    </div>
  );
}
