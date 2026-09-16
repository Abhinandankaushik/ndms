'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ClipboardPlus, Siren } from 'lucide-react';
import Link from 'next/link';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { useNow } from '@/components/citizen/common/hooks';
import { CitizenPage, ErrorPanel, LoadingBlocks, PageHeader } from '@/components/citizen/common/page';
import { Button } from '@/components/ui/button';
import { listMyIncidents } from '@/lib/api/endpoints/incidents';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident } from '@/lib/api/types';
import { IncidentListItem } from './IncidentListItem';
import { isOpenStatus } from './presentation';

export function useMyIncidents() {
  return useQuery({
    queryKey: queryKeys.incidents.mine,
    queryFn: ({ signal }) => listMyIncidents({ signal }),
  });
}

export function MyIncidentsList() {
  const now = useNow();
  const incidents = useMyIncidents();

  return (
    <CitizenPage>
      <PageHeader
        title="My reports"
        description="Every SOS and report you sent, with its latest status."
        action={
          <Button asChild className="h-11">
            <Link href="/citizen/report">
              <ClipboardPlus />
              New
            </Link>
          </Button>
        }
      />
      <IncidentsContent query={incidents} now={now} />
    </CitizenPage>
  );
}

function IncidentsContent({ query, now }: { query: ReturnType<typeof useMyIncidents>; now: number }) {
  if (!query.data) {
    return query.isError ? (
      <ErrorPanel
        title="Your reports could not be loaded"
        message={describeApiError(query.error)}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    ) : (
      <LoadingBlocks label="Loading your reports" />
    );
  }

  if (query.data.length === 0) return <NoIncidents />;

  const open = query.data.filter((incident) => isOpenStatus(incident.status));
  const closed = query.data.filter((incident) => !isOpenStatus(incident.status));

  return (
    <>
      {open.length > 0 && <IncidentGroup title="Open" incidents={open} now={now} />}
      {closed.length > 0 && <IncidentGroup title="Closed" incidents={closed} now={now} />}
    </>
  );
}

function IncidentGroup({ title, incidents, now }: { title: string; incidents: readonly Incident[]; now: number }) {
  return (
    <section className="grid gap-2" aria-label={`${title} reports`}>
      <h2 className="text-lg font-semibold">
        {title} <span className="font-normal text-foreground/70">({incidents.length})</span>
      </h2>
      <ul className="grid gap-2">
        {incidents.map((incident) => (
          <li key={incident.id}>
            <IncidentListItem incident={incident} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoIncidents() {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center">
      <ClipboardList aria-hidden className="size-10 text-foreground/60" />
      <p className="text-lg font-semibold">You have not sent any reports</p>
      <p className="text-base text-foreground/80">When you send an SOS or a report, you can follow it here.</p>
      <div className="grid w-full gap-2 min-[400px]:grid-cols-2">
        <Button asChild size="xl" variant="destructive">
          <Link href="/citizen">
            <Siren />
            SOS
          </Link>
        </Button>
        <Button asChild size="xl" variant="outline">
          <Link href="/citizen/report">
            <ClipboardPlus />
            Report
          </Link>
        </Button>
      </div>
    </div>
  );
}
