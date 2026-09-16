import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { listVolunteerTasks } from '@/lib/api/endpoints/volunteer-tasks';
import { queryKeys } from '@/lib/api/query-keys';
import type { VolunteerTask, VolunteerTaskListQuery } from '@/lib/api/types';
import { getQueryClient } from '@/lib/query/query-client';

const FACILITY_TASK_LIST_QUERY: VolunteerTaskListQuery = { limit: 200 };
const facilityTaskListKey = queryKeys.volunteerTasks.list(FACILITY_TASK_LIST_QUERY);

export function useFacilityTasks(facilityId: string) {
  const selectFacilityTasks = useCallback(
    (tasks: VolunteerTask[]) => tasks.filter((task) => task.facilityId === facilityId),
    [facilityId],
  );
  return useQuery({
    queryKey: facilityTaskListKey,
    queryFn: ({ signal }) => listVolunteerTasks(FACILITY_TASK_LIST_QUERY, { signal }),
    select: selectFacilityTasks,
  });
}

// Also used when the list itself cannot be fetched: the query keeps this data through a failed refetch, so a task
// created here stays visible for the rest of the session.
export function rememberVolunteerTask(task: VolunteerTask): void {
  getQueryClient().setQueryData<VolunteerTask[]>(facilityTaskListKey, (tasks = []) => {
    const existing = tasks.find((candidate) => candidate.id === task.id);
    if (!existing) return [task, ...tasks];
    if (existing.updatedAt > task.updatedAt) return tasks;
    return tasks.map((candidate) => (candidate.id === task.id ? task : candidate));
  });
}

export function refreshFacilityTasks(): void {
  void getQueryClient().invalidateQueries({ queryKey: facilityTaskListKey });
}
