'use client';

import type { LatLngTuple, PathOptions } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import { IncidentMarker } from '@/components/map/IncidentMarker';
import type { Incident, LatLon, Mission, Team } from '@/lib/api/types';
import { TeamMarker } from '../map/TeamMarkersLayer';
import { useNow } from '../lib/useNow';
import { openIncident } from '../workspace-store';

const LINK_STYLE: PathOptions = { color: '#0f172a', weight: 2, opacity: 0.7, dashArray: '6 6' };
const FOCUS_MIN_ZOOM = 13;

export interface MissionLink {
  mission: Mission;
  team: Team;
  incident: Incident & LatLon;
}

export function TeamsMapLayers({
  teams,
  links,
  focus,
  onSelectTeam,
}: {
  teams: readonly Team[];
  links: readonly MissionLink[];
  focus: (LatLon & { requestedAt: number }) | null;
  onSelectTeam: (teamId: string) => void;
}) {
  const now = useNow();
  const incidents = useMemo(() => [...new Map(links.map((link) => [link.incident.id, link.incident])).values()], [links]);
  const lines = useMemo(
    () =>
      links.map((link) => ({
        id: link.mission.id,
        positions: [
          [link.team.lat, link.team.lon],
          [link.incident.lat, link.incident.lon],
        ] satisfies LatLngTuple[],
      })),
    [links],
  );

  return (
    <>
      <DistrictOutline />
      {lines.map((line) => (
        <Polyline key={line.id} positions={line.positions} pathOptions={LINK_STYLE} interactive={false} />
      ))}
      {incidents.map((incident) => (
        <IncidentMarker key={incident.id} incident={incident} onSelect={openIncident} />
      ))}
      {teams.map((team) => (
        <TeamMarker key={team.id} team={team} now={now} onSelect={onSelectTeam} />
      ))}
      <FlyToFocus focus={focus} />
    </>
  );
}

function FlyToFocus({ focus }: { focus: (LatLon & { requestedAt: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), FOCUS_MIN_ZOOM), { duration: 0.8 });
  }, [focus, map]);
  return null;
}
