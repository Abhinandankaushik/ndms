'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, MapPinOff, RefreshCw, Truck, Users } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { createMission } from '@/lib/api/endpoints/missions';
import { queryKeys } from '@/lib/api/query-keys';
import type { IncidentDetail, NearbyTeam } from '@/lib/api/types';
import { RESCUE_AGENCY_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { DisasterTypeLabel, IncidentStatusBadge, PriorityBadge, SosBadge } from '../common/badges';
import { describeError, hasErrorCode } from '../lib/errors';
import { formatAge, formatDistance, formatPeople, humanizeCode } from '../lib/format';
import { useNow } from '../lib/useNow';
import { isOpenIncident } from '../lib/workflow';
import { syncMissionRecord } from '../realtime/cache-sync';
import { incidentDetailQuery, nearestTeamsQuery, teamsQuery } from '../queries';
import { closeDispatch, openIncident, useGovtWorkspace } from '../workspace-store';

const NEAREST_TEAM_COUNT = 5;
const ANY_CAPABILITY = 'any';
const MAX_ETA_MINUTES = 1_440;
// A straight-line distance at typical flood-road speed; only a starting value for the dispatcher to correct.
const ESTIMATE_SPEED_KMH = 30;
const MIN_ESTIMATE_MINUTES = 5;

export function DispatchDialog() {
  const incidentId = useGovtWorkspace((state) => state.dispatchIncidentId);

  return (
    <Dialog open={incidentId !== null} onOpenChange={(open) => !open && closeDispatch()}>
      {incidentId && <DispatchContent key={incidentId} incidentId={incidentId} />}
    </Dialog>
  );
}

function DispatchContent({ incidentId }: { incidentId: string }) {
  const incident = useQuery(incidentDetailQuery(incidentId));

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Dispatch a rescue team</DialogTitle>
        <DialogDescription>The five nearest available teams in your district, closest first.</DialogDescription>
      </DialogHeader>
      {incident.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : incident.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{describeError(incident.error)}</AlertDescription>
        </Alert>
      ) : (
        <DispatchForm incident={incident.data} />
      )}
    </DialogContent>
  );
}

function DispatchForm({ incident }: { incident: IncidentDetail }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const capabilityId = useId();
  const etaId = useId();
  const [capability, setCapability] = useState(ANY_CAPABILITY);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [eta, setEta] = useState('');
  const [etaEdited, setEtaEdited] = useState(false);

  const allTeams = useQuery(teamsQuery());
  const capabilities = useMemo(
    () => [...new Set(allTeams.data?.flatMap((team) => team.capabilities))].sort(),
    [allTeams.data],
  );
  const nearest = useQuery({
    ...nearestTeamsQuery({
      incidentId: incident.id,
      capability: capability === ANY_CAPABILITY ? undefined : capability,
      limit: NEAREST_TEAM_COUNT,
    }),
    refetchOnMount: 'always',
  });
  const selectedTeam = nearest.data?.find((team) => team.id === selectedTeamId) ?? null;

  const etaMinutes = eta.trim() === '' ? undefined : Number(eta);
  const etaIsValid = etaMinutes === undefined || (Number.isInteger(etaMinutes) && etaMinutes >= 0 && etaMinutes <= MAX_ETA_MINUTES);

  const mutation = useMutation({
    mutationFn: (team: NearbyTeam) => createMission({ incidentId: incident.id, teamId: team.id, etaMinutes }),
    onSuccess: (mission, team) => {
      syncMissionRecord(queryClient, mission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incident.id) });
      toast({
        title: `${team.name} dispatched`,
        description: 'The team has been notified and the incident is now assigned. Waiting for the team to accept.',
        variant: 'success',
      });
      closeDispatch();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'TEAM_UNAVAILABLE')) {
        setSelectedTeamId(null);
        void nearest.refetch();
      }
    },
  });

  const chooseTeam = (team: NearbyTeam) => {
    setSelectedTeamId(team.id);
    if (!etaEdited) setEta(String(estimateMinutes(team.distanceM)));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedTeam && etaIsValid && !mutation.isPending) mutation.mutate(selectedTeam);
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <IncidentSummary incident={incident} now={now} />

      {!isOpenIncident(incident.status) && (
        <Alert variant="warning">
          <CircleAlert />
          <AlertTitle>This incident is closed</AlertTitle>
          <AlertDescription>Reopen it from the incident drawer before dispatching a team.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={capabilityId}>Required capability</Label>
          <Select
            value={capability}
            onValueChange={(value) => {
              setCapability(value);
              setSelectedTeamId(null);
            }}
          >
            <SelectTrigger id={capabilityId} className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_CAPABILITY}>Any capability</SelectItem>
              {capabilities.map((option) => (
                <SelectItem key={option} value={option}>
                  {humanizeCode(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void nearest.refetch()} disabled={nearest.isFetching}>
          <RefreshCw className={cn(nearest.isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <NearestTeams
        incident={incident}
        query={nearest}
        selectedTeamId={selectedTeamId}
        onChoose={chooseTeam}
        now={now}
        capabilityFiltered={capability !== ANY_CAPABILITY}
      />

      <div className="grid gap-1.5">
        <Label htmlFor={etaId}>ETA in minutes (optional)</Label>
        <Input
          id={etaId}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_ETA_MINUTES}
          step={1}
          value={eta}
          aria-invalid={!etaIsValid}
          className="w-40"
          onChange={(event) => {
            setEta(event.target.value);
            setEtaEdited(true);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Filled in from straight-line distance at {ESTIMATE_SPEED_KMH} km/h. Correct it once the team confirms.
        </p>
      </div>

      {mutation.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{describeError(mutation.error)}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={closeDispatch} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!selectedTeam || !etaIsValid || mutation.isPending || !isOpenIncident(incident.status)}>
          {mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Truck />}
          {selectedTeam ? `Dispatch ${selectedTeam.name}` : 'Choose a team'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function IncidentSummary({ incident, now }: { incident: IncidentDetail; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <PriorityBadge score={incident.priorityScore} />
      {incident.isSos && <SosBadge />}
      <DisasterTypeLabel type={incident.type} className="font-medium" />
      <IncidentStatusBadge status={incident.status} />
      <span className="text-muted-foreground">
        {formatPeople(incident.peopleAffected)} · {formatAge(incident.reportedAt, now)}
      </span>
    </div>
  );
}

function NearestTeams({
  incident,
  query,
  selectedTeamId,
  onChoose,
  now,
  capabilityFiltered,
}: {
  incident: IncidentDetail;
  query: { data: NearbyTeam[] | undefined; isPending: boolean; error: Error | null };
  selectedTeamId: string | null;
  onChoose: (team: NearbyTeam) => void;
  now: number;
  capabilityFiltered: boolean;
}) {
  const groupName = useId();

  if (query.isPending) {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (query.error) {
    if (hasErrorCode(query.error, 'INCIDENT_HAS_NO_LOCATION')) {
      return (
        <Alert variant="warning">
          <MapPinOff />
          <AlertTitle>This incident has no location yet</AlertTitle>
          <AlertDescription>
            <p>Nearest teams are found by distance. Place a pin on the incident first, for example after calling the reporter.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => {
                closeDispatch();
                openIncident(incident.id);
              }}
            >
              Open the incident
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertDescription>{describeError(query.error)}</AlertDescription>
      </Alert>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <Alert>
        <Users />
        <AlertTitle>No available teams</AlertTitle>
        <AlertDescription>
          {capabilityFiltered
            ? 'No available team in the district has that capability. Try "Any capability".'
            : 'Every team in the district is busy. Teams become available again when they finish or decline a mission.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Nearest available teams</legend>
      {query.data.map((team) => (
        <label
          key={team.id}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50',
            selectedTeamId === team.id && 'border-primary bg-muted/60 ring-1 ring-primary',
          )}
        >
          <input
            type="radio"
            name={groupName}
            checked={selectedTeamId === team.id}
            onChange={() => onChoose(team)}
            className="mt-1 size-4 accent-primary"
          />
          <span className="grid flex-1 gap-1">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{team.name}</span>
              <span className="text-sm font-semibold tabular-nums">{formatDistance(team.distanceM)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {RESCUE_AGENCY_LABELS[team.agency]} · {team.teamSize} members ·{' '}
              {team.locationUpdatedAt ? `position ${formatAge(team.locationUpdatedAt, now)}` : 'no recent position'}
              {team.activeMissionId && ' · has another open mission'}
            </span>
            {team.capabilities.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {team.capabilities.map((entry) => (
                  <Badge key={entry} variant="secondary" className="font-normal">
                    {humanizeCode(entry)}
                  </Badge>
                ))}
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function estimateMinutes(distanceM: number): number {
  return Math.max(MIN_ESTIMATE_MINUTES, Math.round((distanceM / 1_000 / ESTIMATE_SPEED_KMH) * 60));
}
