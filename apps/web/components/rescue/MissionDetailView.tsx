'use client';

import { ChevronLeft, CircleAlert, MapPinOff, MapPinX, RotateCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/api-error';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { useIncidentSubscription } from '@/lib/realtime/socket';
import { useHeldDevicePosition } from './device-position';
import { DistanceBearing } from './DistanceBearing';
import { formatAgo, formatPeople } from './format';
import { IncidentFacts } from './IncidentFacts';
import { LiveLocationBar } from './LiveLocationBar';
import { MissionActions } from './MissionActions';
import { DisasterTypeIcon, MissionStatusBadge, SosBadge, VulnerabilityFlags } from './MissionBadges';
import { freshestMissionView, type MissionView } from './mission-cache';
import { isOpenMission } from './mission-flow';
import { MissionClosure, MissionProgress } from './MissionProgress';
import { isMissionId, useMissionDetail, useMyMissions } from './useMissions';
import { useNow } from './useNow';
import { VictimContact } from './VictimContact';

// Leaflet touches window when its module loads, so the map is never rendered on the server.
const MissionMap = dynamic(() => import('./MissionMap').then((module) => module.MissionMap), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-xl sm:h-96" />,
});

export function MissionDetailView({ missionId }: { missionId: string }) {
  const detail = useMissionDetail(missionId);
  const summary = useMyMissions().data?.find((mission) => mission.id === missionId);
  const mission = freshestMissionView(detail.data, summary);

  if (!isMissionId(missionId) || (isApiError(detail.error) && detail.error.status === 404)) {
    return <MissionUnavailable />;
  }
  if (!mission) {
    return detail.isError ? (
      <MissionLoadFailed onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
    ) : (
      <MissionDetailSkeleton />
    );
  }
  return (
    <MissionDetail
      key={mission.id}
      mission={mission}
      contactLoadFailed={detail.isError}
      onRetryContact={() => void detail.refetch()}
    />
  );
}

function MissionDetail({
  mission,
  contactLoadFailed,
  onRetryContact,
}: {
  mission: MissionView;
  contactLoadFailed: boolean;
  onRetryContact: () => void;
}) {
  const open = isOpenMission(mission.status);
  const gps = useHeldDevicePosition(open);
  const nowMs = useNow(10_000);
  useIncidentSubscription(open ? mission.incidentId : null);
  const { incident } = mission;
  const target = incident.lat !== null && incident.lon !== null ? { lat: incident.lat, lon: incident.lon } : null;

  return (
    <div className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-4 px-4 pt-2">
      <Button asChild variant="ghost" className="-ml-3 h-12 w-fit px-3 text-base font-bold">
        <Link href="/rescue">
          <ChevronLeft aria-hidden className="size-6" />
          All missions
        </Link>
      </Button>

      <header className="grid gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl leading-tight font-black">
            <DisasterTypeIcon type={incident.type} className="size-7 shrink-0" />
            {incident.isSos && <SosBadge />}
            <span>{DISASTER_TYPE_LABELS[incident.type]}</span>
          </h1>
          <MissionStatusBadge status={mission.status} className="mt-1 shrink-0" />
        </div>
        <p className="text-base font-semibold">
          {formatPeople(incident.peopleAffected)} affected · reported {formatAgo(Date.parse(incident.reportedAt), nowMs)}
        </p>
        <VulnerabilityFlags incident={incident} />
      </header>

      <MissionProgress status={mission.status} />
      <MissionClosure mission={mission} />
      <LiveLocationBar />

      {target && open && (
        <DistanceBearing
          target={target}
          targetAccuracyM={incident.accuracyM}
          gpsStatus={gps.status}
          fix={gps.fix}
          nowMs={nowMs}
        />
      )}

      <VictimContact mission={mission} loadFailed={contactLoadFailed} onRetry={onRetryContact} />

      {target ? (
        <MissionMap
          incident={{
            ...target,
            accuracyM: incident.accuracyM,
            type: incident.type,
            status: incident.status,
            isSos: incident.isSos,
          }}
          team={open ? gps.fix : null}
        />
      ) : (
        <div role="note" className="grid gap-1 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
          <p className="flex items-center gap-2 text-lg font-bold">
            <MapPinOff aria-hidden className="size-6 shrink-0" />
            No location was shared
          </p>
          <p className="text-base font-medium">Call the victim to find out where they are.</p>
        </div>
      )}

      <IncidentFacts incident={incident} nowMs={nowMs} />
      <MissionActions mission={mission} />
    </div>
  );
}

function MissionUnavailable() {
  return (
    <CenteredMessage icon={<MapPinX aria-hidden className="size-12" />} title="Mission not found">
      <p className="text-base font-medium">It may have been reassigned, or it belongs to another team.</p>
      <BackToMissionsButton />
    </CenteredMessage>
  );
}

function MissionLoadFailed({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <CenteredMessage icon={<CircleAlert aria-hidden className="size-12 text-red-700" />} title="Could not load this mission">
      <p className="text-base font-medium">Your phone could not get the mission from NDMS. Check the connection.</p>
      <Button type="button" className="h-16 w-full text-lg font-bold" onClick={onRetry} disabled={retrying}>
        <RotateCw aria-hidden className={retrying ? 'size-6 animate-spin' : 'size-6'} />
        {retrying ? 'Trying…' : 'Try again'}
      </Button>
      <BackToMissionsButton />
    </CenteredMessage>
  );
}

function CenteredMessage({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-screen-sm justify-items-center gap-4 px-4 py-10 text-center">
      {icon}
      <h1 className="text-2xl font-black">{title}</h1>
      {children}
    </section>
  );
}

function BackToMissionsButton() {
  return (
    <Button asChild variant="outline" className="h-14 w-full border-2 border-slate-900 text-base font-bold">
      <Link href="/rescue">
        <ChevronLeft aria-hidden className="size-6" />
        Back to missions
      </Link>
    </Button>
  );
}

function MissionDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading mission" className="mx-auto grid w-full max-w-screen-sm gap-4 px-4 pt-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
