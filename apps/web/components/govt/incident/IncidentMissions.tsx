'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Mission } from '@/lib/api/types';
import { RESCUE_AGENCY_LABELS } from '@/lib/labels';
import { MissionStatusBadge } from '../common/badges';
import { describeError } from '../lib/errors';
import { formatAge, formatClockTime, shortId } from '../lib/format';
import { useNow } from '../lib/useNow';
import { isOpenMission } from '../lib/workflow';
import { CancelMissionDialog } from '../missions/CancelMissionDialog';
import { missionsQuery, teamsQuery } from '../queries';

const MISSIONS_PER_INCIDENT = 20;

export function IncidentMissions({ incidentId }: { incidentId: string }) {
  const now = useNow();
  const missions = useQuery(missionsQuery({ incidentId, limit: MISSIONS_PER_INCIDENT }));
  const teams = useQuery(teamsQuery());
  const [cancelling, setCancelling] = useState<Mission | null>(null);
  const teamNames = useMemo(() => new Map(teams.data?.map((team) => [team.id, team.name])), [teams.data]);
  const teamAgencies = useMemo(() => new Map(teams.data?.map((team) => [team.id, team.agency])), [teams.data]);

  if (missions.isPending) return <p className="text-sm text-muted-foreground">Loading missions…</p>;
  if (missions.error) return <p className="text-sm text-destructive">{describeError(missions.error)}</p>;
  if (missions.data.length === 0) return <p className="text-sm text-muted-foreground">No team has been dispatched yet.</p>;

  const nameOf = (teamId: string) => teamNames.get(teamId) ?? `Team #${shortId(teamId)}`;

  return (
    <>
      <ul className="grid gap-2">
        {missions.data.map((mission) => {
          const agency = teamAgencies.get(mission.teamId);
          return (
            <li key={mission.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="grid gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {nameOf(mission.teamId)}
                  {agency && <span className="text-xs font-normal text-muted-foreground">{RESCUE_AGENCY_LABELS[agency]}</span>}
                  <MissionStatusBadge status={mission.status} />
                </span>
                <span className="text-xs text-muted-foreground">
                  Assigned {formatAge(mission.assignedAt, now)}
                  {mission.etaMinutes !== null &&
                    ` · ETA ${formatClockTime(Date.parse(mission.assignedAt) + mission.etaMinutes * 60_000)}`}
                  {mission.peopleRescued !== null && ` · ${mission.peopleRescued} rescued`}
                  {mission.rejectionReason && ` · declined: ${mission.rejectionReason}`}
                </span>
              </div>
              {isOpenMission(mission.status) && (
                <Button variant="outline" size="sm" onClick={() => setCancelling(mission)}>
                  Cancel
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <CancelMissionDialog
        mission={cancelling}
        teamName={cancelling ? nameOf(cancelling.teamId) : ''}
        onClose={() => setCancelling(null)}
      />
    </>
  );
}
