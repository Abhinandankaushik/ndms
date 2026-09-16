'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { MissionWithIncident } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { PositionFix } from './device-position';
import { formatAgo, formatPeople } from './format';
import { formatDistance, haversineMetres } from './geo';
import { DisasterTypeIcon, MissionStatusBadge, SosBadge, VulnerabilityFlags } from './MissionBadges';
import type { MissionGroup } from './mission-flow';

export interface MissionCardProps {
  mission: MissionWithIncident;
  group: MissionGroup;
  /** The team's recent position, when GPS is already running; the list never starts GPS itself. */
  position: PositionFix | null;
  nowMs: number;
}

export function MissionCard({ mission, group, position, nowMs }: MissionCardProps) {
  const { incident } = mission;
  const closed = group === 'closed';
  const distanceM =
    position && incident.lat !== null && incident.lon !== null
      ? haversineMetres(position, { lat: incident.lat, lon: incident.lon })
      : null;
  const summary = incident.addressText ?? incident.description;

  return (
    <Link
      href={`/rescue/missions/${mission.id}`}
      className={cn(
        'grid gap-3 rounded-xl border-2 bg-card p-4 text-card-foreground shadow-sm outline-none transition-colors hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-slate-900/40 active:bg-slate-100',
        closed ? 'border-slate-300' : incident.isSos ? 'border-red-700' : 'border-slate-900',
        group === 'current' && 'border-4 border-slate-900',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DisasterTypeIcon type={incident.type} className="size-7 shrink-0" />
          {incident.isSos && <SosBadge />}
          <h3 className="text-xl leading-tight font-bold">{DISASTER_TYPE_LABELS[incident.type]}</h3>
        </div>
        <MissionStatusBadge status={mission.status} className="shrink-0" />
      </div>

      <p className="text-base font-semibold">
        {formatPeople(incident.peopleAffected)} affected · reported {formatAgo(Date.parse(incident.reportedAt), nowMs)}
        {!closed && incident.priorityScore !== null && ` · priority ${Math.round(incident.priorityScore)}`}
      </p>

      {!closed && <VulnerabilityFlags incident={incident} />}
      {!closed && summary && <p className="line-clamp-2 text-base">{summary}</p>}

      <div className="flex items-center justify-between gap-3 border-t-2 pt-3 text-base font-bold">
        <span>
          {closed
            ? `Updated ${formatAgo(Date.parse(mission.updatedAt), nowMs)}`
            : incident.lat === null
              ? 'No location shared'
              : distanceM !== null
                ? `${formatDistance(distanceM)} away (straight line)`
                : 'Open mission'}
        </span>
        <ChevronRight aria-hidden className="size-6 shrink-0" />
      </div>
    </Link>
  );
}
