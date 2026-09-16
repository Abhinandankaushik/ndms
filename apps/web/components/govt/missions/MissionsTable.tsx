'use client';

import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Incident, Mission, Team } from '@/lib/api/types';
import { RESCUE_AGENCY_LABELS } from '@/lib/labels';
import { useSessionUser } from '@/lib/auth/session';
import { DisasterTypeLabel, MissionStatusBadge, PriorityBadge, SosBadge } from '../common/badges';
import { formatAge, formatClockTime, formatDateTime, shortId } from '../lib/format';
import { isOpenMission } from '../lib/workflow';
import { openIncident } from '../workspace-store';
import { CancelMissionDialog } from './CancelMissionDialog';

export function MissionsTable({
  missions,
  teamsById,
  incidentsById,
  now,
}: {
  missions: readonly Mission[];
  teamsById: ReadonlyMap<string, Team>;
  incidentsById: ReadonlyMap<string, Incident>;
  now: number;
}) {
  const currentUserId = useSessionUser()?.id ?? null;
  const [cancelling, setCancelling] = useState<Mission | null>(null);
  const teamName = (teamId: string) => teamsById.get(teamId)?.name ?? `Team #${shortId(teamId)}`;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Incident</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {missions.map((mission) => {
            const team = teamsById.get(mission.teamId);
            const incident = incidentsById.get(mission.incidentId);
            return (
              <TableRow key={mission.id}>
                <TableCell>
                  <div className="grid">
                    <span className="font-medium">{teamName(mission.teamId)}</span>
                    {team && <span className="text-xs text-muted-foreground">{RESCUE_AGENCY_LABELS[team.agency]}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    className="h-auto justify-start gap-2 px-2 py-1 text-left"
                    onClick={() => openIncident(mission.incidentId)}
                  >
                    {incident ? (
                      <>
                        <PriorityBadge score={incident.priorityScore} />
                        {incident.isSos && <SosBadge />}
                        <DisasterTypeLabel type={incident.type} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">Incident #{shortId(mission.incidentId)}</span>
                    )}
                    <ExternalLink aria-hidden className="size-3.5 text-muted-foreground" />
                  </Button>
                </TableCell>
                <TableCell>
                  <MissionStatusBadge status={mission.status} />
                </TableCell>
                <TableCell>
                  <div className="grid text-sm">
                    <time dateTime={mission.assignedAt} title={formatDateTime(mission.assignedAt)}>
                      {formatAge(mission.assignedAt, now)}
                    </time>
                    <span className="text-xs text-muted-foreground">
                      {mission.assignedBy === currentUserId ? 'by you' : 'by another official'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{progressOf(mission)}</TableCell>
                <TableCell className="max-w-64 text-sm whitespace-normal">{outcomeOf(mission)}</TableCell>
                <TableCell className="text-right">
                  {isOpenMission(mission.status) && (
                    <Button variant="outline" size="sm" onClick={() => setCancelling(mission)}>
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <CancelMissionDialog
        mission={cancelling}
        teamName={cancelling ? teamName(cancelling.teamId) : ''}
        onClose={() => setCancelling(null)}
      />
    </>
  );
}

function progressOf(mission: Mission): string {
  if (mission.completedAt && mission.status === 'COMPLETED') return `Completed ${formatClockTime(mission.completedAt)}`;
  if (mission.reachedAt) return `On site since ${formatClockTime(mission.reachedAt)}`;
  if (mission.acceptedAt) return `Accepted ${formatClockTime(mission.acceptedAt)}`;
  if (mission.etaMinutes !== null && isOpenMission(mission.status)) {
    return `ETA ${formatClockTime(Date.parse(mission.assignedAt) + mission.etaMinutes * 60_000)}`;
  }
  return isOpenMission(mission.status) ? 'Waiting for the team' : '–';
}

function outcomeOf(mission: Mission): string {
  if (mission.status === 'COMPLETED') {
    const parts = [`${mission.peopleRescued ?? 0} rescued`];
    if (mission.injuredCount) parts.push(`${mission.injuredCount} injured`);
    if (mission.hospitalRequired) parts.push('hospital needed');
    if (mission.outcomeNotes) parts.push(mission.outcomeNotes);
    return parts.join(' · ');
  }
  if (mission.status === 'REJECTED') return mission.rejectionReason ? `Declined: ${mission.rejectionReason}` : 'Declined';
  if (mission.status === 'CANCELLED') return mission.outcomeNotes ? `Cancelled: ${mission.outcomeNotes}` : 'Cancelled';
  return '–';
}
