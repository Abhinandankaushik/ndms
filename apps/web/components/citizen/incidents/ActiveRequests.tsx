'use client';

import Link from 'next/link';
import { useNow } from '@/components/citizen/common/hooks';
import { IncidentListItem } from './IncidentListItem';
import { useMyIncidents } from './MyIncidentsList';
import { isOpenStatus } from './presentation';

const MAX_SHOWN = 3;

export function ActiveRequests() {
  const now = useNow();
  const { data } = useMyIncidents();
  const open = (data ?? []).filter((incident) => isOpenStatus(incident.status));
  if (open.length === 0) return null;

  return (
    <section aria-labelledby="active-requests-title" className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="active-requests-title" className="text-lg font-semibold">
          Your open requests
        </h2>
        {open.length > MAX_SHOWN && (
          <Link href="/citizen/incidents" className="min-h-11 content-center text-base font-medium underline-offset-4 hover:underline">
            See all {open.length}
          </Link>
        )}
      </div>
      <ul className="grid gap-2">
        {open.slice(0, MAX_SHOWN).map((incident) => (
          <li key={incident.id}>
            <IncidentListItem incident={incident} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
