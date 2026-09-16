'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellOff, LoaderCircle, LocateFixed, MapPinOff } from 'lucide-react';
import { useState } from 'react';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { useNow, useRefetchOnReconnect } from '@/components/citizen/common/hooks';
import { CitizenPage, ErrorPanel, LoadingBlocks, PageHeader } from '@/components/citizen/common/page';
import { useDeviceFix } from '@/components/citizen/location/use-device-fix';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listActiveAlerts } from '@/lib/api/endpoints/alerts';
import { queryKeys } from '@/lib/api/query-keys';
import type { LatLon } from '@/lib/api/types';
import { useSocketEvent } from '@/lib/realtime/socket';
import { AlertCard } from './AlertCard';
import { alertCoversPosition, isAlertExpired, type FeedAlert } from './geofence';
import { SEVERITY_STYLES } from './presentation';

// About 110 m: moving within this distance reuses the answer the server already gave for the position.
const QUERY_COORDINATE_DECIMALS = 3;
const ACTIVE_ALERTS_REFRESH_MS = 2 * 60_000;

export function AlertFeed() {
  const now = useNow();
  const device = useDeviceFix({ locateOnMount: true });
  const position: LatLon | null = device.fix ? { lat: device.fix.lat, lon: device.fix.lon } : null;
  const [liveAlerts, setLiveAlerts] = useState<readonly FeedAlert[]>([]);
  const [cancelledIds, setCancelledIds] = useState<ReadonlySet<string>>(() => new Set());

  const active = useQuery({
    queryKey: queryKeys.alerts.active(roundCoordinate(position?.lat), roundCoordinate(position?.lon)),
    queryFn: ({ signal }) => listActiveAlerts(position ?? {}, { signal }),
    staleTime: 0,
    refetchInterval: ACTIVE_ALERTS_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  useRefetchOnReconnect(queryKeys.alerts.all);

  useSocketEvent('alert:broadcast', (alert) => {
    setLiveAlerts((current) => [alert, ...current.filter((existing) => existing.id !== alert.id)]);
  });
  useSocketEvent('alert:cancelled', ({ id }) => {
    setCancelledIds((current) => new Set(current).add(id));
  });

  const alerts = visibleAlerts(active.data ?? [], liveAlerts, cancelledIds, position, now);
  const visibleIds = new Set(alerts.map((alert) => alert.id));
  const liveIds = new Set(liveAlerts.map((alert) => alert.id));
  const newestLiveAlert = liveAlerts.find((alert) => visibleIds.has(alert.id));

  return (
    <CitizenPage>
      <PageHeader title="Alerts" description="Warnings from the district control room for where you are." />

      {!position &&
        (device.isLocating ? (
          <p role="status" className="flex items-center gap-2 text-base font-medium">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
            Checking your location for local alerts…
          </p>
        ) : (
          <Alert variant="warning">
            <MapPinOff />
            <AlertTitle className="line-clamp-none text-base">Only district-wide alerts are shown</AlertTitle>
            <AlertDescription className="text-base">
              <p>
                {device.failure?.message ?? 'Your location is not available.'} Alerts for a specific area need your
                location.
              </p>
              <Button type="button" variant="outline" className="mt-2 h-11" onClick={device.locate}>
                <LocateFixed />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ))}

      {active.isError && active.data !== undefined && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not check for new alerts. Showing what NDMS sent earlier.
        </p>
      )}

      {alerts.length > 0 ? (
        <ul className="grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <AlertCard alert={alert} now={now} isNew={liveIds.has(alert.id)} />
            </li>
          ))}
        </ul>
      ) : active.data === undefined ? (
        active.isError ? (
          <ErrorPanel
            title="Alerts could not be loaded"
            message={describeApiError(active.error)}
            onRetry={() => void active.refetch()}
            isRetrying={active.isFetching}
          />
        ) : (
          <LoadingBlocks count={2} label="Loading alerts" />
        )
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center">
          <BellOff aria-hidden className="size-10 text-foreground/60" />
          <p className="text-lg font-semibold">No active alerts</p>
          <p className="text-base text-foreground/80">New alerts appear here as soon as officials send them.</p>
        </div>
      )}

      <p aria-live="assertive" className="sr-only">
        {newestLiveAlert ? `New ${newestLiveAlert.severity.toLowerCase()} alert: ${newestLiveAlert.title}` : ''}
      </p>
    </CitizenPage>
  );
}

// The server already filtered what it returned for this position; alerts that arrive live are filtered here with
// the same rules, because a broadcast goes to everyone with the role.
function visibleAlerts(
  fetched: readonly FeedAlert[],
  live: readonly FeedAlert[],
  cancelledIds: ReadonlySet<string>,
  position: LatLon | null,
  now: number,
): FeedAlert[] {
  const byId = new Map<string, FeedAlert>();
  for (const alert of fetched) byId.set(alert.id, alert);
  for (const alert of live) {
    if (!byId.has(alert.id) && alertCoversPosition(alert, position)) byId.set(alert.id, alert);
  }
  return [...byId.values()]
    .filter((alert) => !cancelledIds.has(alert.id) && !isAlertExpired(alert, now))
    .sort(
      (a, b) =>
        SEVERITY_STYLES[b.severity].rank - SEVERITY_STYLES[a.severity].rank || Date.parse(b.issuedAt) - Date.parse(a.issuedAt),
    );
}

function roundCoordinate(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const factor = 10 ** QUERY_COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}
