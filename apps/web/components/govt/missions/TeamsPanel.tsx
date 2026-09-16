'use client';

import { LocateFixed, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Mission, Team } from '@/lib/api/types';
import { RESCUE_AGENCY_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { MissionStatusBadge } from '../common/badges';
import { EmptyNotice } from '../common/QueryStates';
import { formatAge, humanizeCode } from '../lib/format';
import { isStalePosition } from '../lib/teams';

export function TeamsPanel({
  teams,
  openMissionsById,
  selectedTeamId,
  onSelectTeam,
  now,
  className,
}: {
  teams: readonly Team[];
  openMissionsById: ReadonlyMap<string, Mission>;
  selectedTeamId: string | null;
  onSelectTeam: (team: Team) => void;
  now: number;
  className?: string;
}) {
  if (teams.length === 0) {
    return (
      <EmptyNotice icon={Truck} title="No rescue teams in this district" className={className}>
        Teams appear here once they are registered for the district.
      </EmptyNotice>
    );
  }

  const available = teams.filter((team) => team.isAvailable).length;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">
        {available} of {teams.length} teams available · select a team to find it on the map
      </p>
      <ul className="relative min-h-0 flex-1 divide-y overflow-y-auto">
        {teams.map((team) => {
          const mission = team.activeMissionId ? openMissionsById.get(team.activeMissionId) : undefined;
          const stale = isStalePosition(team, now);
          return (
            <li key={team.id}>
              <button
                type="button"
                onClick={() => onSelectTeam(team)}
                aria-pressed={selectedTeamId === team.id}
                className={cn(
                  'grid w-full gap-1 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
                  selectedTeamId === team.id && 'bg-muted',
                )}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{team.name}</span>
                  {team.isAvailable ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
                      Available
                    </Badge>
                  ) : mission ? (
                    <MissionStatusBadge status={mission.status} />
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                      Busy
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {RESCUE_AGENCY_LABELS[team.agency]} · {team.teamSize} members
                </span>
                <span className={cn('inline-flex items-center gap-1 text-xs', stale ? 'text-amber-800' : 'text-muted-foreground')}>
                  <LocateFixed aria-hidden className="size-3" />
                  {team.locationUpdatedAt ? `Position ${formatAge(team.locationUpdatedAt, now)}` : 'No position reported yet'}
                  {stale && team.locationUpdatedAt && ' (stale)'}
                </span>
                {team.capabilities.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {team.capabilities.map((capability) => (
                      <Badge key={capability} variant="secondary" className="font-normal">
                        {humanizeCode(capability)}
                      </Badge>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
