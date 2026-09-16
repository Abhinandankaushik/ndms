'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheckBig, PhoneCall, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { describeApiError, isNotFoundError } from '@/components/citizen/common/api-errors';
import { formatClockTime, formatRelativeTime, formatTimestamp } from '@/components/citizen/common/format';
import { useNow } from '@/components/citizen/common/hooks';
import { BackLink, CitizenPage, ErrorPanel, LoadingBlocks } from '@/components/citizen/common/page';
import { acknowledgeSentSos } from '@/components/citizen/sos/sos-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getIncident } from '@/lib/api/endpoints/incidents';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident } from '@/lib/api/types';
import { useSessionUser } from '@/lib/auth/session';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { IncidentDetailsCard } from './IncidentDetailsCard';
import { IncidentLocationCard } from './IncidentLocationCard';
import { IncidentPhotosCard } from './IncidentPhotosCard';
import { IncidentStatusBadge } from './IncidentStatusBadge';
import { useIncidentLiveUpdates } from './live-updates';
import { DISASTER_TYPE_ICONS, isOpenStatus, STATUS_GUIDANCE } from './presentation';
import { StatusTimeline } from './StatusTimeline';

export type JustSent = 'sos' | 'report' | null;

// Longer than this between the phone's clock and the server receiving it means the report waited on the device.
const DELIVERY_DELAY_WORTH_SHOWING_MS = 2 * 60_000;

export function IncidentStatusView({ incidentId, justSent }: { incidentId: string; justSent: JustSent }) {
  const user = useSessionUser();
  const now = useNow();
  const detail = useQuery({
    queryKey: queryKeys.incidents.detail(incidentId),
    queryFn: ({ signal }) => getIncident(incidentId, { signal }),
  });
  useIncidentLiveUpdates(incidentId);

  useEffect(() => {
    acknowledgeSentSos(incidentId);
  }, [incidentId]);

  const incident = detail.data;
  if (!incident) {
    return (
      <CitizenPage>
        <BackLink href="/citizen/incidents">My reports</BackLink>
        {detail.isError ? (
          isNotFoundError(detail.error) ? (
            <NotFound />
          ) : (
            <ErrorPanel
              title="This report could not be loaded"
              message={describeApiError(detail.error)}
              onRetry={() => void detail.refetch()}
              isRetrying={detail.isFetching}
            />
          )
        ) : (
          <LoadingBlocks count={3} label="Loading the report" />
        )}
      </CitizenPage>
    );
  }

  const canEdit = user?.id === incident.reporterId && isOpenStatus(incident.status);

  return (
    <CitizenPage>
      <BackLink href="/citizen/incidents">My reports</BackLink>
      {justSent ? (
        <SentConfirmation kind={justSent} incident={incident} />
      ) : (
        <h1 className="sr-only">{incident.isSos ? 'SOS status' : 'Report status'}</h1>
      )}
      <CurrentStatus incident={incident} now={now} />
      <IncidentLocationCard incident={incident} canEdit={canEdit} />
      <IncidentDetailsCard incident={incident} canEdit={canEdit} startEditing={justSent === 'sos'} />
      <IncidentPhotosCard incidentId={incident.id} canAdd={canEdit} />
      <StatusTimeline timeline={incident.timeline} now={now} />
    </CitizenPage>
  );
}

function SentConfirmation({ kind, incident }: { kind: 'sos' | 'report'; incident: Incident }) {
  return (
    <div role="status" className="grid gap-3 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4 text-emerald-950">
      <div className="flex items-start gap-3">
        <CircleCheckBig aria-hidden className="size-8 shrink-0 text-emerald-700" />
        <div className="grid gap-1">
          <h1 className="text-xl font-bold">{kind === 'sos' ? 'SOS sent' : 'Report sent'}</h1>
          <p className="text-base">
            NDMS received it at {formatClockTime(incident.createdAt)}. Officials in the district control room can
            see it now.
          </p>
          {kind === 'sos' && (
            <p className="text-base">Stay where you are if it is safe, and keep your phone switched on.</p>
          )}
        </div>
      </div>
      {kind === 'sos' && (
        <Button asChild size="xl" variant="outline" className="w-full border-emerald-700 bg-white text-emerald-950">
          <a href="tel:112">
            <PhoneCall className="size-5" />
            If you can, also call 112
          </a>
        </Button>
      )}
    </div>
  );
}

function CurrentStatus({ incident, now }: { incident: Incident; now: number }) {
  const guidance = STATUS_GUIDANCE[incident.status];
  const TypeIcon = DISASTER_TYPE_ICONS[incident.type];
  const deliveryDelayMs = Date.parse(incident.createdAt) - Date.parse(incident.reportedAt);

  return (
    <section aria-label="Current status" className="grid gap-3 rounded-xl border-2 border-foreground/15 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {incident.isSos && <Badge className="bg-red-600 px-2.5 py-1 text-sm font-bold text-white">SOS</Badge>}
        <span className="inline-flex items-center gap-1.5 text-base font-medium">
          <TypeIcon aria-hidden className="size-5" />
          {DISASTER_TYPE_LABELS[incident.type]}
        </span>
        <IncidentStatusBadge status={incident.status} className="ml-auto" />
      </div>
      <div aria-live="polite" className="grid gap-1">
        <h2 className="text-xl font-bold">{guidance.headline}</h2>
        <p className="text-base">{guidance.detail}</p>
      </div>
      <p className="text-sm text-foreground/75">
        Sent {formatRelativeTime(incident.reportedAt, now)} · {formatTimestamp(incident.reportedAt, now)}
      </p>
      {deliveryDelayMs > DELIVERY_DELAY_WORTH_SHOWING_MS && (
        <p className="text-sm text-foreground/75">
          Saved on the phone at {formatTimestamp(incident.reportedAt, now)} and received by NDMS at{' '}
          {formatTimestamp(incident.createdAt, now)}.
        </p>
      )}
    </section>
  );
}

function NotFound() {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border p-6 text-center">
      <SearchX aria-hidden className="size-10 text-foreground/60" />
      <h1 className="text-xl font-bold">Report not found</h1>
      <p className="text-base text-foreground/80">It may belong to another account, or the link is incomplete.</p>
      <Button asChild size="xl">
        <Link href="/citizen/incidents">See my reports</Link>
      </Button>
    </div>
  );
}
