'use client';

import { Flag, MapPinOff, Truck } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import type { Incident, ReviewReason } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS, REVIEW_REASON_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { DisasterTypeLabel, IncidentStatusBadge, PriorityBadge, SosBadge } from '../common/badges';
import { VulnerabilityFlags } from '../common/VulnerabilityFlags';
import { formatAge, formatPeople } from '../lib/format';
import { isOpenIncident } from '../lib/workflow';
import { useIsRecentIncident } from '../realtime/recent-incidents';
import { openDispatch, openIncident } from '../workspace-store';

export interface QueueRowProps {
  incident: Incident;
  now: number;
  reviewReasons: readonly ReviewReason[];
}

// One click from seeing a report to dispatching a team (plan A2.3): the row opens the incident, Assign opens the
// nearest-team dialog directly.
export const QueueRow = memo(function QueueRow({ incident, now, reviewReasons }: QueueRowProps) {
  const isRecent = useIsRecentIncident(incident.id);
  const typeLabel = DISASTER_TYPE_LABELS[incident.type];

  return (
    <li
      className={cn(
        'flex items-start gap-2 border-l-4 border-l-transparent px-3 py-2.5 transition-colors duration-700',
        incident.isSos && 'border-l-red-600',
        isRecent && 'bg-amber-50',
      )}
    >
      <button
        type="button"
        onClick={() => openIncident(incident.id)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <PriorityBadge score={incident.priorityScore} className="mt-0.5" />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            {incident.isSos && <SosBadge />}
            <DisasterTypeLabel type={incident.type} />
            <IncidentStatusBadge status={incident.status} />
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatPeople(incident.peopleAffected)}</span>
            <VulnerabilityFlags incident={incident} />
            <span aria-hidden>·</span>
            <time dateTime={incident.reportedAt}>{formatAge(incident.reportedAt, now)}</time>
            {incident.lat === null && (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <MapPinOff aria-hidden className="size-3" />
                No location
              </span>
            )}
            {reviewReasons.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-amber-800"
                title={reviewReasons.map((reason) => REVIEW_REASON_LABELS[reason]).join(', ')}
              >
                <Flag aria-hidden className="size-3" />
                Needs review
              </span>
            )}
          </span>
          {incident.addressText && <span className="truncate text-xs text-muted-foreground">{incident.addressText}</span>}
        </span>
      </button>
      {isOpenIncident(incident.status) && (
        <Button
          size="sm"
          variant={incident.status === 'REPORTED' || incident.status === 'VERIFIED' ? 'default' : 'outline'}
          className="mt-0.5"
          onClick={() => openDispatch(incident.id)}
          aria-label={`Assign a team to this ${typeLabel.toLowerCase()} incident`}
        >
          <Truck />
          Assign
        </Button>
      )}
    </li>
  );
});
