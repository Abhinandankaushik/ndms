'use client';

import { CircleAlert, ClipboardList, Clock, Info, MapPin, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { VOLUNTEER_TASK_STATUSES, type Facility, type VolunteerTask, type VolunteerTaskStatus } from '@/lib/api/types';
import { VOLUNTEER_TASK_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { describeApiError, isApiStatus } from './describe-error';
import { useFacilityTasks } from './facility-tasks';
import { distanceMetres, formatCount, formatDateTime, formatDistance, formatRelativeTime, humanizeCode } from './format';
import { useNow } from './use-now';

type TaskFilter = 'ALL' | VolunteerTaskStatus;

const AT_FACILITY_RADIUS_M = 50;
const CLOCK_REFRESH_MS = 60_000;

const STATUS_BADGE_VARIANT = {
  OPEN: 'secondary',
  ACCEPTED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'outline',
} as const satisfies Record<VolunteerTaskStatus, 'secondary' | 'default' | 'success' | 'outline'>;

export function FacilityTaskList({ facility }: { facility: Facility }) {
  const tasksQuery = useFacilityTasks(facility.id);
  const [filter, setFilter] = useState<TaskFilter>('ALL');
  const nowMs = useNow(CLOCK_REFRESH_MS);

  const tasks = tasksQuery.data ?? [];
  const isListForbidden = isApiStatus(tasksQuery.error, 403);
  const visibleTasks = filter === 'ALL' ? tasks : tasks.filter((task) => task.status === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tasks for this facility</CardTitle>
        <CardDescription>Newest first. A task shows as accepted once a volunteer takes it.</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh tasks"
            disabled={tasksQuery.isFetching}
            onClick={() => void tasksQuery.refetch()}
          >
            <RefreshCw className={cn(tasksQuery.isFetching && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isListForbidden && (
          <Alert>
            <Info />
            <AlertTitle>Task list not available yet</AlertTitle>
            <AlertDescription>
              NDMS does not yet share the task list with facility accounts. Tasks you post here stay listed until you
              reload the page, but their status will not update.
            </AlertDescription>
          </Alert>
        )}
        {tasksQuery.isError && !isListForbidden && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Could not load tasks</AlertTitle>
            <AlertDescription>{describeApiError(tasksQuery.error)}</AlertDescription>
          </Alert>
        )}

        <StatusFilter tasks={tasks} value={filter} onChange={setFilter} />

        {tasksQuery.isPending ? (
          <div className="grid gap-3" role="status" aria-label="Loading tasks">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : visibleTasks.length === 0 ? (
          <EmptyTasks filter={filter} isListForbidden={isListForbidden} />
        ) : (
          <ul className="grid gap-3">
            {visibleTasks.map((task) => (
              <TaskItem key={task.id} task={task} facility={facility} nowMs={nowMs} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusFilter({
  tasks,
  value,
  onChange,
}: {
  tasks: readonly VolunteerTask[];
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
}) {
  const options: { filter: TaskFilter; label: string; count: number }[] = [
    { filter: 'ALL', label: 'All', count: tasks.length },
    ...VOLUNTEER_TASK_STATUSES.map((status) => ({
      filter: status,
      label: VOLUNTEER_TASK_STATUS_LABELS[status],
      count: tasks.filter((task) => task.status === status).length,
    })),
  ];

  return (
    <div role="group" aria-label="Filter tasks by status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((option) => (
        <Button
          key={option.filter}
          type="button"
          size="sm"
          variant={value === option.filter ? 'default' : 'outline'}
          aria-pressed={value === option.filter}
          className="shrink-0"
          onClick={() => onChange(option.filter)}
        >
          {option.label}
          <span className="tabular-nums opacity-70">{formatCount(option.count)}</span>
        </Button>
      ))}
    </div>
  );
}

function EmptyTasks({ filter, isListForbidden }: { filter: TaskFilter; isListForbidden: boolean }) {
  const message = isListForbidden
    ? 'Tasks you post from this page appear here.'
    : filter === 'ALL'
      ? 'No tasks posted for this facility yet.'
      : `No ${VOLUNTEER_TASK_STATUS_LABELS[filter].toLowerCase()} tasks.`;

  return (
    <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <ClipboardList aria-hidden className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TaskItem({ task, facility, nowMs }: { task: VolunteerTask; facility: Facility; nowMs: number }) {
  const distance = distanceMetres(facility, task);
  const place = distance <= AT_FACILITY_RADIUS_M ? 'At the facility' : `${formatDistance(distance)} from the facility`;
  const progress = progressNote(task, nowMs);

  return (
    <li className="grid gap-2 rounded-lg border p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="leading-snug font-medium break-words">{task.title}</p>
        <Badge variant={STATUS_BADGE_VARIANT[task.status]} className="shrink-0">
          {VOLUNTEER_TASK_STATUS_LABELS[task.status]}
        </Badge>
      </div>
      {task.description && <p className="line-clamp-3 text-sm break-words text-muted-foreground">{task.description}</p>}
      {task.requiredSkills.length > 0 ? (
        <ul aria-label="Required skills" className="flex flex-wrap gap-1.5">
          {task.requiredSkills.map((skill) => (
            <li key={skill}>
              <Badge variant="outline">{humanizeCode(skill)}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Any verified volunteer can take it</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin aria-hidden className="size-3.5" />
          {place}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-3.5" />
          <time dateTime={task.createdAt} title={formatDateTime(task.createdAt)}>
            Posted {formatRelativeTime(task.createdAt, nowMs)}
          </time>
        </span>
        {progress && <span>{progress}</span>}
      </div>
    </li>
  );
}

function progressNote(task: VolunteerTask, nowMs: number): string | null {
  switch (task.status) {
    case 'ACCEPTED':
      return task.acceptedAt ? `Taken ${formatRelativeTime(task.acceptedAt, nowMs)}` : 'Taken by a volunteer';
    case 'COMPLETED':
      return task.completedAt ? `Completed ${formatRelativeTime(task.completedAt, nowMs)}` : null;
    case 'CANCELLED':
      return `Cancelled ${formatRelativeTime(task.updatedAt, nowMs)}`;
    default:
      return null;
  }
}
