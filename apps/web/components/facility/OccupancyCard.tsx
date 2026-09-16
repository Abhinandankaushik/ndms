'use client';

import { WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FacilityDetail } from '@/lib/api/types';
import { CapacityBar } from './CapacityBar';
import { capacityLevel, OCCUPANCY_WORDING, utilisationPercent, type CapacityLevel } from './capacity';
import { formatCount, formatSignedStep, pluralize } from './format';
import { occupancySync, usePendingDelta } from './facility-sync';
import { SaveStatus } from './SaveStatus';
import { useOnlineStatus } from './use-online-status';

const OCCUPANCY_STEPS = [-10, -5, -1, 1, 5, 10] as const;

export function OccupancyCard({ facility }: { facility: FacilityDetail }) {
  const pending = usePendingDelta(occupancySync, facility.id);
  const isOnline = useOnlineStatus();
  const wording = OCCUPANCY_WORDING[facility.kind];
  const hasCapacity = facility.capacity > 0;
  const isFull = hasCapacity && facility.occupancy >= facility.capacity;

  const isStepDisabled = (step: number) =>
    !isOnline || !hasCapacity || (step < 0 ? facility.occupancy === 0 : isFull);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">{wording.heading}</CardTitle>
        <CardDescription>Record arrivals and departures as they happen.</CardDescription>
        <CardAction>
          <LevelBadge level={capacityLevel(facility)} isFull={isFull} hasCapacity={hasCapacity} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div aria-live="polite" className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="tabular-nums">
            <span className="text-5xl font-bold tracking-tight sm:text-6xl">{formatCount(facility.occupancy)}</span>
            <span className="text-xl font-medium text-muted-foreground"> / {formatCount(facility.capacity)}</span>
          </p>
          <p className="text-3xl font-semibold tabular-nums">{utilisationPercent(facility)}%</p>
        </div>

        <CapacityBar headcount={facility} />

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{pluralize(Math.max(0, facility.freeCapacity), wording.free)}</span>
          <SaveStatus pending={pending} />
        </div>

        {!isOnline && (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <WifiOff aria-hidden className="size-4 shrink-0" />
            You are offline. Counts can be changed again once the connection returns.
          </p>
        )}
        {!hasCapacity && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This facility has no capacity set, so nobody can be checked in. Ask the district control room to set one.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
          {OCCUPANCY_STEPS.map((step) => (
            <Button
              key={step}
              type="button"
              variant={step > 0 ? 'default' : 'outline'}
              className="h-16 touch-manipulation text-xl font-semibold tabular-nums"
              aria-label={`${step > 0 ? 'Add' : 'Remove'} ${pluralize(Math.abs(step), wording.occupant)}`}
              disabled={isStepDisabled(step)}
              onClick={() => occupancySync.push(facility.id, step)}
            >
              {formatSignedStep(step)}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LevelBadge({ level, isFull, hasCapacity }: { level: CapacityLevel; isFull: boolean; hasCapacity: boolean }) {
  if (!hasCapacity) return <Badge variant="outline">No capacity set</Badge>;
  if (isFull) return <Badge variant="destructive">Full</Badge>;
  if (level === 'critical') return <Badge variant="destructive">Near capacity</Badge>;
  if (level === 'warning') return <Badge variant="warning">Filling up</Badge>;
  return <Badge variant="success">Space available</Badge>;
}
