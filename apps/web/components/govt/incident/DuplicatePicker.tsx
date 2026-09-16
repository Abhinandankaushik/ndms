'use client';

import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Incident, IncidentStatus, LatLon, MapMarkerQuery } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS, INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { formatDistance, formatMinutes, formatPeople, shortId } from '../lib/format';
import { bboxAround, distanceMeters, locationOf } from '../lib/geo';
import { isUuid } from '../lib/workflow';
import { incidentDetailQuery, incidentMarkersQuery } from '../queries';

// About 2 km around the report: well beyond the worker's 150 m duplicate rule, still a short list.
const SEARCH_RADIUS_DEGREES = 0.02;
const MAX_CANDIDATES = 12;
const CANDIDATE_STATUSES: readonly IncidentStatus[] = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];

export type DuplicateSubject = Pick<Incident, 'id' | 'type' | 'lat' | 'lon' | 'reportedAt'>;

export interface DuplicatePickerProps {
  incident: DuplicateSubject;
  value: string;
  onChange: (incidentId: string) => void;
  /** The related incident a POSSIBLE_DUPLICATE review points at. */
  suggestedId?: string | null;
}

export function DuplicatePicker({ incident, value, onChange, suggestedId }: DuplicatePickerProps) {
  const groupName = useId();
  const manualId = useId();
  const [manualValue, setManualValue] = useState('');
  const location = useMemo(() => locationOf({ lat: incident.lat, lon: incident.lon }), [incident.lat, incident.lon]);
  const manualIsInvalid = manualValue.trim() !== '' && !isUuid(manualValue.trim());

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Original incident (required)</legend>
      <p className="text-xs text-muted-foreground">
        This report will be closed as a duplicate of the incident you pick, and its history links to it.
      </p>
      <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border p-1">
        {suggestedId && suggestedId !== incident.id && (
          <SuggestedCandidate
            incident={incident}
            candidateId={suggestedId}
            groupName={groupName}
            checked={value === suggestedId}
            onSelect={onChange}
          />
        )}
        {location ? (
          <NearbyCandidates
            incident={incident}
            location={location}
            excludeId={suggestedId ?? null}
            groupName={groupName}
            value={value}
            onSelect={onChange}
          />
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            This report has no location, so nearby incidents cannot be listed. Paste the original incident&apos;s ID below.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={manualId} className="text-xs font-normal text-muted-foreground">
          Or paste the original incident ID
        </Label>
        <Input
          id={manualId}
          value={manualValue}
          placeholder="e.g. 3f2a91c0-…"
          aria-invalid={manualIsInvalid}
          onChange={(event) => {
            const next = event.target.value;
            setManualValue(next);
            if (isUuid(next.trim()) && next.trim() !== incident.id) onChange(next.trim());
          }}
        />
        {manualIsInvalid && <p className="text-xs text-destructive">That is not a complete incident ID.</p>}
        {manualValue.trim() === incident.id && (
          <p className="text-xs text-destructive">An incident cannot be a duplicate of itself.</p>
        )}
      </div>
    </fieldset>
  );
}

interface Candidate {
  id: string;
  type: Incident['type'];
  status: IncidentStatus;
  peopleAffected: number;
  reportedAt: string;
  distanceM: number | null;
}

function NearbyCandidates({
  incident,
  location,
  excludeId,
  groupName,
  value,
  onSelect,
}: {
  incident: DuplicateSubject;
  location: LatLon;
  excludeId: string | null;
  groupName: string;
  value: string;
  onSelect: (incidentId: string) => void;
}) {
  const query = useMemo<MapMarkerQuery>(
    () => ({ bbox: bboxAround(location, SEARCH_RADIUS_DEGREES), status: CANDIDATE_STATUSES, limit: 500 }),
    [location],
  );
  const { data, isPending, error } = useQuery(incidentMarkersQuery(query));

  const candidates = useMemo<Candidate[]>(
    () =>
      (data ?? [])
        .filter((marker) => marker.id !== incident.id && marker.id !== excludeId)
        .map((marker) => ({ ...marker, distanceM: distanceMeters(location, marker) }))
        .sort((a, b) => Number(b.type === incident.type) - Number(a.type === incident.type) || a.distanceM - b.distanceM)
        .slice(0, MAX_CANDIDATES),
    [data, incident.id, incident.type, excludeId, location],
  );

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (error) return <p className="px-2 py-3 text-sm text-destructive">Nearby incidents could not be loaded.</p>;
  if (candidates.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">No other incidents within about 2 km.</p>;
  }
  return (
    <>
      {candidates.map((candidate) => (
        <CandidateOption
          key={candidate.id}
          incident={incident}
          candidate={candidate}
          groupName={groupName}
          checked={value === candidate.id}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function SuggestedCandidate({
  incident,
  candidateId,
  groupName,
  checked,
  onSelect,
}: {
  incident: DuplicateSubject;
  candidateId: string;
  groupName: string;
  checked: boolean;
  onSelect: (incidentId: string) => void;
}) {
  const { data } = useQuery(incidentDetailQuery(candidateId));
  const origin = locationOf(incident);
  const target = data ? locationOf(data) : null;
  const candidate: Candidate | null = data
    ? {
        id: data.id,
        type: data.type,
        status: data.status,
        peopleAffected: data.peopleAffected,
        reportedAt: data.reportedAt,
        distanceM: origin && target ? distanceMeters(origin, target) : null,
      }
    : null;

  if (!candidate) {
    return (
      <label className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm">
        <input
          type="radio"
          name={groupName}
          checked={checked}
          onChange={() => onSelect(candidateId)}
          className="size-4 accent-primary"
        />
        Incident #{shortId(candidateId)} (suggested by the review)
      </label>
    );
  }
  return (
    <CandidateOption
      incident={incident}
      candidate={candidate}
      groupName={groupName}
      checked={checked}
      onSelect={onSelect}
      suggested
    />
  );
}

function CandidateOption({
  incident,
  candidate,
  groupName,
  checked,
  onSelect,
  suggested = false,
}: {
  incident: DuplicateSubject;
  candidate: Candidate;
  groupName: string;
  checked: boolean;
  onSelect: (incidentId: string) => void;
  suggested?: boolean;
}) {
  const minutesApart = Math.abs(Date.parse(incident.reportedAt) - Date.parse(candidate.reportedAt)) / 60_000;
  const earlier = Date.parse(candidate.reportedAt) <= Date.parse(incident.reportedAt);

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 text-sm hover:bg-muted/60',
        checked && 'bg-muted',
      )}
    >
      <input
        type="radio"
        name={groupName}
        checked={checked}
        onChange={() => onSelect(candidate.id)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="grid gap-0.5">
        <span className="font-medium">
          {DISASTER_TYPE_LABELS[candidate.type]} · {INCIDENT_STATUS_LABELS[candidate.status]}
          {suggested && <span className="ml-2 text-xs font-normal text-amber-800">Suggested by the review</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {candidate.distanceM === null ? 'distance unknown' : `${formatDistance(candidate.distanceM)} away`} ·{' '}
          {formatMinutes(minutesApart)} {earlier ? 'earlier' : 'later'} · {formatPeople(candidate.peopleAffected)} · #
          {shortId(candidate.id)}
        </span>
      </span>
    </label>
  );
}
