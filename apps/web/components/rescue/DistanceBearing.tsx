'use client';

import { LoaderCircle, LocateOff, Navigation2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LatLon } from '@/lib/api/types';
import { retryDevicePosition, type GpsStatus, type PositionFix } from './device-position';
import { formatAgo } from './format';
import { bearingDegrees, COMPASS_POINT_NAMES, compassPoint, formatDistance, haversineMetres } from './geo';
import { GPS_PROBLEMS, isStaleFix } from './gps-status';

export interface DistanceBearingProps {
  target: LatLon;
  targetAccuracyM: number | null;
  gpsStatus: GpsStatus;
  fix: PositionFix | null;
  nowMs: number;
}

export function DistanceBearing({ target, targetAccuracyM, gpsStatus, fix, nowMs }: DistanceBearingProps) {
  if (!fix) return <WithoutPosition gpsStatus={gpsStatus} />;

  const distanceM = haversineMetres(fix, target);
  const bearing = bearingDegrees(fix, target);
  const wholeDegrees = Math.round(bearing) % 360;
  const point = compassPoint(bearing);
  const withinGpsAccuracy = distanceM <= (fix.accuracyM ?? 0) + (targetAccuracyM ?? 0);

  return (
    <section aria-label="Distance to the incident" className="flex items-center gap-4 rounded-xl border-2 border-slate-900 p-4">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
        <Navigation2 aria-hidden className="size-9 fill-current" style={{ transform: `rotate(${bearing}deg)` }} />
      </div>
      <div className="grid min-w-0 gap-1">
        <p className="text-3xl leading-none font-black tracking-tight">{formatDistance(distanceM)}</p>
        <p className="text-lg leading-tight font-bold">
          <span aria-hidden>
            {point} · {wholeDegrees}°
          </span>
          <span className="sr-only">
            to the {COMPASS_POINT_NAMES[point]}, bearing {wholeDegrees} degrees
          </span>
        </p>
        <p className="text-sm font-medium">
          {withinGpsAccuracy
            ? 'You are within GPS accuracy of the incident.'
            : 'Straight line from you, not the road route. North is up.'}
        </p>
        {isStaleFix(fix, nowMs) && (
          <p className="text-sm font-bold text-amber-800">Measured from where you were {formatAgo(fix.recordedAtMs, nowMs)}.</p>
        )}
      </div>
    </section>
  );
}

function WithoutPosition({ gpsStatus }: { gpsStatus: GpsStatus }) {
  const problem = GPS_PROBLEMS[gpsStatus];

  if (!problem) {
    return (
      <section aria-label="Distance to the incident" className="rounded-xl border-2 border-slate-300 p-4">
        <p role="status" className="flex items-center gap-2 text-base font-semibold">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Finding your position to measure the distance…
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Distance to the incident" className="grid gap-3 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-950">
      <p role="status" className="flex items-center gap-2 text-base font-bold">
        <LocateOff aria-hidden className="size-5 shrink-0" />
        {problem.title}
      </p>
      <p className="text-sm font-medium">Distance and direction need your position. {problem.message}</p>
      {problem.canRetry && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full border-2 border-current bg-white text-base font-bold"
          onClick={retryDevicePosition}
        >
          <RotateCw aria-hidden className="size-5" />
          Try again
        </Button>
      )}
    </section>
  );
}
