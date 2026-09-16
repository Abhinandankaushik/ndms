import { ChevronRight, MapPinOff, Users } from 'lucide-react';
import Link from 'next/link';
import { formatCount, formatRelativeTime } from '@/components/citizen/common/format';
import type { Incident } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { IncidentStatusBadge } from './IncidentStatusBadge';
import { DISASTER_TYPE_ICONS } from './presentation';

export function IncidentListItem({ incident, now }: { incident: Incident; now: number }) {
  const TypeIcon = DISASTER_TYPE_ICONS[incident.type];
  const title = incident.isSos ? 'SOS' : DISASTER_TYPE_LABELS[incident.type];

  return (
    <Link
      href={`/citizen/incidents/${encodeURIComponent(incident.id)}`}
      className="flex min-h-20 items-center gap-3 rounded-xl border-2 bg-card p-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className={
          incident.isSos
            ? 'flex size-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white'
            : 'flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground'
        }
      >
        <TypeIcon className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-bold">{title}</span>
          <IncidentStatusBadge status={incident.status} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-foreground/75">
          <span>Sent {formatRelativeTime(incident.reportedAt, now)}</span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-4" />
            {formatCount(incident.peopleAffected)}
            <span className="sr-only"> people</span>
          </span>
          {incident.locationSource === 'NONE' && (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <MapPinOff aria-hidden className="size-4" />
              No location
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground/60" />
    </Link>
  );
}
