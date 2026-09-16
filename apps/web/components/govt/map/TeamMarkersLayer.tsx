'use client';

import { useQuery } from '@tanstack/react-query';
import type { LatLngTuple } from 'leaflet';
import { memo, useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import type { Team } from '@/lib/api/types';
import { RESCUE_AGENCY_LABELS } from '@/lib/labels';
import { formatAge } from '../lib/format';
import { isStalePosition } from '../lib/teams';
import { useNow } from '../lib/useNow';
import { teamsQuery } from '../queries';
import { teamIcon } from './govt-map-icons';

const TEAM_Z_OFFSET = 500;

export function TeamMarkersLayer() {
  const { data } = useQuery(teamsQuery());
  const now = useNow();
  return (
    <>
      {data?.map((team) => (
        <TeamMarker key={team.id} team={team} now={now} />
      ))}
    </>
  );
}

export const TeamMarker = memo(function TeamMarker({
  team,
  now,
  onSelect,
}: {
  team: Team;
  now: number;
  onSelect?: (teamId: string) => void;
}) {
  const position = useMemo<LatLngTuple>(() => [team.lat, team.lon], [team.lat, team.lon]);
  const isStale = isStalePosition(team, now);
  const eventHandlers = useMemo(() => (onSelect ? { click: () => onSelect(team.id) } : undefined), [onSelect, team.id]);
  const title = `Team ${team.name}`;

  return (
    <Marker
      position={position}
      icon={teamIcon({ isAvailable: team.isAvailable, isStale })}
      title={title}
      alt={title}
      zIndexOffset={TEAM_Z_OFFSET}
      eventHandlers={eventHandlers}
    >
      <Tooltip direction="top" offset={[0, -10]}>
        <div className="grid gap-0.5 text-xs">
          <span className="font-semibold">{team.name}</span>
          <span>
            {RESCUE_AGENCY_LABELS[team.agency]} · {team.teamSize} members
          </span>
          <span>{team.isAvailable ? 'Available' : team.activeMissionId ? 'On a mission' : 'Unavailable'}</span>
          <span>
            {team.locationUpdatedAt ? `Position ${formatAge(team.locationUpdatedAt, now)}` : 'No position reported yet'}
          </span>
        </div>
      </Tooltip>
    </Marker>
  );
});
