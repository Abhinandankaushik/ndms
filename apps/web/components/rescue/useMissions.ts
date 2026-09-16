'use client';

import { useQuery } from '@tanstack/react-query';
import { getMission, listMyMissions } from '@/lib/api/endpoints/missions';
import { queryKeys } from '@/lib/api/query-keys';
import { useSocketStatus } from '@/lib/realtime/socket';

// New assignments normally arrive over the socket. While it is down, which is common on 2G, the list polls so a
// mission is never missed for long.
const POLL_WITHOUT_SOCKET_MS = 30_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isMissionId = (value: string): boolean => UUID_PATTERN.test(value);

export function useMyMissions() {
  const socketConnected = useSocketStatus() === 'connected';
  return useQuery({
    queryKey: queryKeys.missions.mine,
    queryFn: ({ signal }) => listMyMissions({ signal }),
    refetchInterval: socketConnected ? false : POLL_WITHOUT_SOCKET_MS,
  });
}

// Every fetch of an open mission reveals the reporter's phone and writes an audit row, so the detail is not
// refetched each time the team returns from the dialler. Events, confirmed steps and socket reconnects refresh it,
// and the polled list keeps its status current while the socket is down.
export function useMissionDetail(missionId: string) {
  return useQuery({
    queryKey: queryKeys.missions.detail(missionId),
    queryFn: ({ signal }) => getMission(missionId, { signal }),
    enabled: isMissionId(missionId),
    refetchOnWindowFocus: false,
  });
}
