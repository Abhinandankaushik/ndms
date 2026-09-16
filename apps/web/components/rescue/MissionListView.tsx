'use client';

import { CircleAlert, Inbox, RotateCw, WifiOff } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/api-error';
import type { MissionWithIncident } from '@/lib/api/types';
import { useSocketStatus } from '@/lib/realtime/socket';
import { useDevicePosition, type PositionFix } from './device-position';
import { formatAgo } from './format';
import { isStaleFix } from './gps-status';
import { LiveLocationBar } from './LiveLocationBar';
import { MissionCard } from './MissionCard';
import { groupMissions, type MissionGroup } from './mission-flow';
import { useMyMissions } from './useMissions';
import { useNow } from './useNow';

const GROUP_TITLES: Record<MissionGroup, string> = {
  current: 'Current mission',
  awaiting: 'Waiting for your answer',
  closed: 'Finished',
};

export function MissionListView() {
  const missions = useMyMissions();
  const socketStatus = useSocketStatus();
  const fix = useDevicePosition((state) => state.fix);
  const nowMs = useNow(15_000);
  const groups = useMemo(() => groupMissions(missions.data ?? []), [missions.data]);
  const openCount = groups.current.length + groups.awaiting.length;
  const position = fix && !isStaleFix(fix, nowMs) ? fix : null;

  return (
    <section className="mx-auto grid w-full max-w-screen-sm content-start gap-5 px-4 py-4">
      <header className="grid gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-black tracking-tight">Missions</h1>
          {missions.data && <p className="text-lg font-bold">{openCount} open</p>}
        </div>
        {socketStatus !== 'connected' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <WifiOff aria-hidden className="size-4 shrink-0" />
            Live updates are offline. Checking for new missions every 30 seconds.
          </p>
        )}
      </header>

      <LiveLocationBar />

      {missions.isPending ? (
        <ListSkeleton />
      ) : !missions.data ? (
        <ListLoadFailed error={missions.error} onRetry={() => void missions.refetch()} retrying={missions.isFetching} />
      ) : (
        <>
          {missions.isError && (
            <StaleListNotice
              updatedAgo={formatAgo(missions.dataUpdatedAt, nowMs)}
              onRetry={() => void missions.refetch()}
              retrying={missions.isFetching}
            />
          )}
          {missions.data.length === 0 ? (
            <EmptyMissions />
          ) : (
            (['current', 'awaiting', 'closed'] as const).map((group) => (
              <MissionGroupSection
                key={group}
                group={group}
                missions={groups[group]}
                position={position}
                nowMs={nowMs}
              />
            ))
          )}
        </>
      )}
    </section>
  );
}

function MissionGroupSection({
  group,
  missions,
  position,
  nowMs,
}: {
  group: MissionGroup;
  missions: MissionWithIncident[];
  position: PositionFix | null;
  nowMs: number;
}) {
  const headingId = useId();
  if (missions.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-lg font-bold">
        {GROUP_TITLES[group]} <span className="font-semibold text-slate-700">({missions.length})</span>
      </h2>
      <ul className="grid gap-3">
        {missions.map((mission) => (
          <li key={mission.id}>
            <MissionCard mission={mission} group={group} position={position} nowMs={nowMs} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading missions" className="grid gap-3">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}

function EmptyMissions() {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed border-slate-400 px-4 py-10 text-center">
      <Inbox aria-hidden className="size-10" />
      <p className="text-xl font-bold">No missions yet</p>
      <p className="text-base font-medium">
        New assignments appear here as soon as the control room dispatches your team, with a buzz on phones that support it.
      </p>
    </div>
  );
}

function ListLoadFailed({ error, onRetry, retrying }: { error: Error | null; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="grid gap-3 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-950">
      <p className="flex items-center gap-2 text-lg font-bold">
        <CircleAlert aria-hidden className="size-6 shrink-0" />
        Could not load your missions
      </p>
      <p className="text-base font-medium">{describeListError(error)}</p>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

function StaleListNotice({ updatedAgo, onRetry, retrying }: { updatedAgo: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="status" className="grid gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
      <p className="text-base font-bold">Could not refresh. These missions are from {updatedAgo}.</p>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

function RetryButton({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-14 w-full border-2 border-current bg-white text-base font-bold"
      onClick={onRetry}
      disabled={retrying}
    >
      <RotateCw aria-hidden className={retrying ? 'size-5 animate-spin' : 'size-5'} />
      {retrying ? 'Trying…' : 'Try again'}
    </Button>
  );
}

function describeListError(error: Error | null): string {
  if (!isApiError(error)) return 'Something went wrong on this phone.';
  if (error.code === 'NO_TEAM_SCOPE') return 'Your account is not linked to a rescue team. Ask the control room to add you to one.';
  if (error.isNetworkError) return 'Your phone could not reach NDMS. Check the connection.';
  return error.message;
}
