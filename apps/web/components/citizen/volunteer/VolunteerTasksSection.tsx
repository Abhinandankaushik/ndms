'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheckBig, ListChecks, LoaderCircle, LocateFixed, Navigation } from 'lucide-react';
import type { ReactNode } from 'react';
import { describeApiError, hasErrorCode } from '@/components/citizen/common/api-errors';
import { directionsUrl } from '@/components/citizen/common/directions';
import { formatDistance, formatRelativeTime } from '@/components/citizen/common/format';
import { useRefetchOnReconnect } from '@/components/citizen/common/hooks';
import { ErrorPanel, LoadingBlocks, Panel } from '@/components/citizen/common/page';
import { FixFailure, requestDeviceFix } from '@/components/citizen/location/geolocation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster';
import { updateMyVolunteerProfile } from '@/lib/api/endpoints/volunteers';
import {
  acceptVolunteerTask,
  completeVolunteerTask,
  listMyVolunteerTasks,
  listNearbyVolunteerTasks,
} from '@/lib/api/endpoints/volunteer-tasks';
import { queryKeys } from '@/lib/api/query-keys';
import type { VolunteerProfile, VolunteerTask } from '@/lib/api/types';
import { useSocketEvent } from '@/lib/realtime/socket';
import { skillLabel } from './skills';

const NEARBY_REFRESH_MS = 2 * 60_000;
const COMPLETED_SHOWN = 5;

export function VolunteerTasksSection({ profile, now }: { profile: VolunteerProfile; now: number }) {
  const queryClient = useQueryClient();
  const refreshTasks = () => void queryClient.invalidateQueries({ queryKey: queryKeys.volunteerTasks.all });

  useSocketEvent('volunteer_task:created', refreshTasks);
  useSocketEvent('volunteer_task:updated', refreshTasks);
  useRefetchOnReconnect(queryKeys.volunteerTasks.all);

  const setProfile = (updated: VolunteerProfile) => queryClient.setQueryData(queryKeys.volunteers.me, updated);

  const availability = useMutation({
    mutationFn: (isAvailable: boolean) => updateMyVolunteerProfile({ isAvailable }),
    onSuccess: (updated) => {
      setProfile(updated);
      refreshTasks();
    },
    onError: (error) => toast({ title: 'Could not change availability', description: describeApiError(error), variant: 'destructive' }),
  });

  const relocation = useMutation({
    mutationFn: async () => {
      const fix = await requestDeviceFix();
      return updateMyVolunteerProfile({ lat: fix.lat, lon: fix.lon });
    },
    onSuccess: (updated) => {
      setProfile(updated);
      refreshTasks();
      toast({ title: 'Location updated', description: 'Tasks are now matched to where you are.', variant: 'success' });
    },
    onError: (error) =>
      toast({
        title: 'Location not updated',
        description: error instanceof FixFailure ? error.message : describeLocationError(error),
        variant: 'destructive',
      }),
  });

  return (
    <>
      <Panel title="Your availability">
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border-2 p-3">
          <span className="grid gap-0.5">
            <span className="text-base font-semibold">Available for tasks</span>
            <span className="text-sm text-foreground/75">
              {profile.isAvailable ? 'You are offered open tasks near you.' : 'Turn this on to be offered tasks.'}
            </span>
          </span>
          <Switch
            checked={profile.isAvailable}
            disabled={availability.isPending}
            onCheckedChange={(checked) => availability.mutate(checked)}
            className="scale-125"
          />
        </label>
        <Button
          type="button"
          size="xl"
          variant="outline"
          className="w-full"
          disabled={relocation.isPending}
          onClick={() => relocation.mutate()}
        >
          {relocation.isPending ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          Match tasks to where I am now
        </Button>
        {profile.locationUpdatedAt && (
          <p className="text-sm text-foreground/75">Location last set {formatRelativeTime(profile.locationUpdatedAt, now)}.</p>
        )}
      </Panel>
      <MyTasks now={now} />
      <NearbyTasks profile={profile} now={now} />
    </>
  );
}

function NearbyTasks({ profile, now }: { profile: VolunteerProfile; now: number }) {
  const queryClient = useQueryClient();
  const nearby = useQuery({
    queryKey: queryKeys.volunteerTasks.nearby,
    queryFn: ({ signal }) => listNearbyVolunteerTasks({ signal }),
    refetchInterval: NEARBY_REFRESH_MS,
  });

  const accept = useMutation({
    mutationFn: acceptVolunteerTask,
    onSuccess: (task) => {
      toast({ title: 'Task accepted', description: task.title, variant: 'success' });
    },
    onError: (error) => toast({ title: 'Task not accepted', description: describeAcceptError(error), variant: 'destructive' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.volunteerTasks.all }),
  });

  return (
    <Panel title="Tasks near you">
      {!nearby.data ? (
        nearby.isError ? (
          <ErrorPanel
            title="Tasks could not be loaded"
            message={describeApiError(nearby.error)}
            onRetry={() => void nearby.refetch()}
            isRetrying={nearby.isFetching}
          />
        ) : (
          <LoadingBlocks count={2} label="Loading tasks near you" />
        )
      ) : nearby.data.length === 0 ? (
        <EmptyTasks>
          {profile.isAvailable
            ? `No open task matches your skills within ${profile.serviceRadiusKm} km right now. New tasks appear here automatically.`
            : 'You are marked as unavailable, so no tasks are offered to you.'}
        </EmptyTasks>
      ) : (
        <ul className="grid gap-3">
          {nearby.data.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} now={now} distanceM={task.distanceM}>
                <Button
                  type="button"
                  size="xl"
                  className="w-full"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(task.id)}
                >
                  {accept.isPending && accept.variables === task.id ? <LoaderCircle className="animate-spin" /> : <Check />}
                  Accept task
                </Button>
              </TaskCard>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MyTasks({ now }: { now: number }) {
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: queryKeys.volunteerTasks.mine,
    queryFn: ({ signal }) => listMyVolunteerTasks({ signal }),
  });

  const complete = useMutation({
    mutationFn: completeVolunteerTask,
    onSuccess: () => toast({ title: 'Task marked as done', description: 'Thank you for helping.', variant: 'success' }),
    onError: (error) => toast({ title: 'Task not updated', description: describeApiError(error), variant: 'destructive' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.volunteerTasks.all }),
  });

  const accepted = (mine.data ?? []).filter((task) => task.status === 'ACCEPTED');
  const finished = (mine.data ?? []).filter((task) => task.status !== 'ACCEPTED').slice(0, COMPLETED_SHOWN);
  if (mine.data && accepted.length === 0 && finished.length === 0) return null;

  return (
    <Panel title="Your tasks">
      {!mine.data ? (
        mine.isError ? (
          <ErrorPanel
            title="Your tasks could not be loaded"
            message={describeApiError(mine.error)}
            onRetry={() => void mine.refetch()}
            isRetrying={mine.isFetching}
          />
        ) : (
          <LoadingBlocks count={1} label="Loading your tasks" />
        )
      ) : (
        <ul className="grid gap-3">
          {accepted.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} now={now}>
                <div className="grid gap-2 min-[400px]:grid-cols-2">
                  <Button asChild size="xl" variant="outline">
                    <a href={directionsUrl(task)} target="_blank" rel="noopener noreferrer">
                      <Navigation />
                      Directions
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="xl"
                    disabled={complete.isPending}
                    onClick={() => complete.mutate(task.id)}
                  >
                    {complete.isPending && complete.variables === task.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <CircleCheckBig />
                    )}
                    Mark as done
                  </Button>
                </div>
              </TaskCard>
            </li>
          ))}
          {finished.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const FINISHED_LABELS: Partial<Record<VolunteerTask['status'], string>> = {
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled by the organiser',
};

function TaskCard({
  task,
  now,
  distanceM,
  children,
}: {
  task: VolunteerTask;
  now: number;
  distanceM?: number;
  children?: ReactNode;
}) {
  const finishedLabel = FINISHED_LABELS[task.status];

  return (
    <article aria-label={task.title} className="grid gap-2 rounded-xl border-2 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg leading-snug font-bold break-words">{task.title}</h3>
        {distanceM !== undefined && <span className="shrink-0 text-base font-bold">{formatDistance(distanceM)}</span>}
      </div>
      {task.description && <p className="text-base break-words whitespace-pre-line">{task.description}</p>}
      {task.requiredSkills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills needed">
          {task.requiredSkills.map((skill) => (
            <li key={skill} className="rounded-md bg-foreground/10 px-2 py-0.5 text-sm font-medium">
              {skillLabel(skill)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-foreground/75">
        {finishedLabel ? `${finishedLabel} · ` : ''}
        Posted {formatRelativeTime(task.createdAt, now)}
      </p>
      {children}
    </article>
  );
}

function EmptyTasks({ children }: { children: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center">
      <ListChecks aria-hidden className="size-8 text-foreground/60" />
      <p className="text-base text-foreground/80">{children}</p>
    </div>
  );
}

function describeAcceptError(error: unknown): string {
  if (hasErrorCode(error, 'TASK_TAKEN')) return 'Another volunteer took this task first.';
  if (hasErrorCode(error, 'TASK_NOT_FOUND')) return 'This task is no longer offered to you.';
  if (hasErrorCode(error, 'VOLUNTEER_UNAVAILABLE')) return 'Turn on "Available for tasks" first.';
  if (hasErrorCode(error, 'VOLUNTEER_NOT_VERIFIED')) return 'Only verified volunteers can accept tasks.';
  return describeApiError(error);
}

function describeLocationError(error: unknown): string {
  if (hasErrorCode(error, 'LOCATION_OUTSIDE_DISTRICT')) return 'You are outside the districts NDMS serves.';
  return describeApiError(error);
}
