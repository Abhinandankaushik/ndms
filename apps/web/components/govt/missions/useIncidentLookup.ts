'use client';

import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Incident, IncidentDetail, IncidentStatus } from '@/lib/api/types';
import { incidentDetailQuery, incidentQueueQuery } from '../queries';

// Open missions almost always point at ASSIGNED or IN_PROGRESS incidents, so one queue request answers most rows;
// only the rest (finished missions, backup teams on resolved incidents) are fetched one by one.
const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = ['ASSIGNED', 'IN_PROGRESS'];
const ACTIVE_LOOKUP_LIMIT = 200;
const MAX_INDIVIDUAL_LOOKUPS = 50;

const detailsOf = (results: UseQueryResult<IncidentDetail>[]) => results.map((result) => result.data);

export function useIncidentLookup(incidentIds: readonly string[]): ReadonlyMap<string, Incident> {
  const active = useQuery(incidentQueueQuery({ status: ACTIVE_INCIDENT_STATUSES, limit: ACTIVE_LOOKUP_LIMIT }));
  const activeSettled = !active.isPending;

  const activeById = useMemo(() => new Map((active.data ?? []).map((incident) => [incident.id, incident])), [active.data]);
  const missingIds = useMemo(
    () =>
      activeSettled
        ? [...new Set(incidentIds)].filter((id) => !activeById.has(id)).slice(0, MAX_INDIVIDUAL_LOOKUPS)
        : [],
    [activeSettled, incidentIds, activeById],
  );
  const details = useQueries({ queries: missingIds.map((id) => incidentDetailQuery(id)), combine: detailsOf });

  return useMemo(() => {
    const merged = new Map<string, Incident>(activeById);
    for (const detail of details) if (detail) merged.set(detail.id, detail);
    return merged;
  }, [activeById, details]);
}
