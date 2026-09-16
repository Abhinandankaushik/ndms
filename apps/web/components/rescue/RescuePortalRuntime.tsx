'use client';

import { useLiveLocationSharing } from './live-location-sharing';
import { sharesLiveLocation } from './mission-flow';
import { useMissionRealtimeSync } from './useMissionRealtimeSync';
import { useMyMissions } from './useMissions';

/**
 * Portal-wide background work, mounted once in the rescue layout so it survives moving between screens: keeps
 * the mission caches in step with socket events and shares the team's position while a mission is under way.
 */
export function RescuePortalRuntime(): null {
  const missions = useMyMissions();
  useMissionRealtimeSync();
  const activeMissionId = missions.data?.find((mission) => sharesLiveLocation(mission.status))?.id ?? null;
  useLiveLocationSharing(activeMissionId);
  return null;
}
