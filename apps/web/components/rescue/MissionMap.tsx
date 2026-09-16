'use client';

import L, { type LatLngTuple, type PathOptions } from 'leaflet';
import { Crosshair } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Circle, CircleMarker, Marker, Polyline, useMap } from 'react-leaflet';
import { BaseMap } from '@/components/map/BaseMap';
import { incidentIcon } from '@/components/map/marker-icons';
import { Button } from '@/components/ui/button';
import type { DisasterType, IncidentStatus } from '@/lib/api/types';
import type { PositionFix } from './device-position';

const INCIDENT_ZOOM = 15;
const FRAME_PADDING_PX: [number, number] = [56, 56];
const FRAME_MAX_ZOOM = 17;
const TEAM_DOT_RADIUS_PX = 8;

// The team is drawn in near-black so it never shares a colour with an incident marker, whose fill follows the
// incident's status (an assigned incident is blue).
const TEAM_DOT_STYLE: PathOptions = { color: '#ffffff', weight: 3, fillColor: '#0f172a', fillOpacity: 1 };
const TEAM_ACCURACY_STYLE: PathOptions = { color: '#0f172a', weight: 1, opacity: 0.7, fillColor: '#0f172a', fillOpacity: 0.1 };
const INCIDENT_ACCURACY_STYLE: PathOptions = { color: '#b91c1c', weight: 2, opacity: 0.8, fillColor: '#ef4444', fillOpacity: 0.15 };
const STRAIGHT_LINE_STYLE: PathOptions = { color: '#0f172a', weight: 3, opacity: 0.85, dashArray: '8 8' };

export interface MissionMapProps {
  incident: {
    lat: number;
    lon: number;
    accuracyM: number | null;
    type: DisasterType;
    status: IncidentStatus;
    isSos: boolean;
  };
  team: PositionFix | null;
}

export function MissionMap({ incident, team }: MissionMapProps) {
  const [frameRequests, setFrameRequests] = useState(0);
  const incidentPoint = useMemo<LatLngTuple>(() => [incident.lat, incident.lon], [incident.lat, incident.lon]);
  const teamPoint: LatLngTuple | null = team ? [team.lat, team.lon] : null;

  return (
    <div className="grid gap-2">
      <div className="relative">
        <BaseMap className="h-72 rounded-xl border-2 border-slate-900 sm:h-96" center={incidentPoint} zoom={INCIDENT_ZOOM}>
          <OneFingerScrollsPage />
          <FrameMission incidentPoint={incidentPoint} teamPoint={teamPoint} frameRequests={frameRequests} />
          {incident.accuracyM !== null && incident.accuracyM > 0 && (
            <Circle center={incidentPoint} radius={incident.accuracyM} pathOptions={INCIDENT_ACCURACY_STYLE} interactive={false} />
          )}
          {teamPoint && <Polyline positions={[teamPoint, incidentPoint]} pathOptions={STRAIGHT_LINE_STYLE} interactive={false} />}
          <Marker position={incidentPoint} icon={incidentIcon(incident)} interactive={false} keyboard={false} />
          {team && teamPoint && (
            <>
              {team.accuracyM !== null && team.accuracyM > 0 && (
                <Circle center={teamPoint} radius={team.accuracyM} pathOptions={TEAM_ACCURACY_STYLE} interactive={false} />
              )}
              <CircleMarker center={teamPoint} radius={TEAM_DOT_RADIUS_PX} pathOptions={TEAM_DOT_STYLE} interactive={false} />
            </>
          )}
        </BaseMap>
        <Button
          type="button"
          variant="outline"
          className="absolute top-3 right-3 z-10 h-12 border-2 border-slate-900 bg-white px-4 text-base font-bold shadow-md"
          onClick={() => setFrameRequests((count) => count + 1)}
        >
          <Crosshair aria-hidden className="size-5" />
          {teamPoint ? 'Show both' : 'Show incident'}
        </Button>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
        {team && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-3.5 rounded-full border-2 border-white bg-slate-900 ring-2 ring-slate-900" />
            You
          </li>
        )}
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3.5 rounded-full border-2 border-red-700 bg-red-500/20" />
          Incident, with its location accuracy
        </li>
        {L.Browser.mobile && <li>Use two fingers to move the map</li>}
      </ul>
    </div>
  );
}

function FrameMission({
  incidentPoint,
  teamPoint,
  frameRequests,
}: {
  incidentPoint: LatLngTuple;
  teamPoint: LatLngTuple | null;
  frameRequests: number;
}) {
  const map = useMap();
  const hasTeam = teamPoint !== null;
  const frame = useEffectEvent(() => {
    if (teamPoint) {
      map.fitBounds(L.latLngBounds([teamPoint, incidentPoint]), { padding: FRAME_PADDING_PX, maxZoom: FRAME_MAX_ZOOM });
    } else {
      map.setView(incidentPoint, INCIDENT_ZOOM);
    }
  });

  // Reframes when the team's first fix arrives, when the incident is moved or on request, but not on every GPS
  // update, which would keep snatching the view from a user who is looking around.
  useEffect(() => {
    frame();
  }, [hasTeam, incidentPoint, frameRequests]);

  return null;
}

// On a phone the map sits inside a scrolling page. One finger scrolls the page and two fingers move or zoom the
// map, so a gloved thumb heading for the action buttons cannot drag the map instead.
function OneFingerScrollsPage() {
  const map = useMap();

  useEffect(() => {
    if (!L.Browser.mobile) return;
    map.dragging.disable();
    return () => {
      map.dragging.enable();
    };
  }, [map]);

  return null;
}
