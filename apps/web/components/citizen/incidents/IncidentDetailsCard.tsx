'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, Save, SquarePen } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { formatCount } from '@/components/citizen/common/format';
import { Panel } from '@/components/citizen/common/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { updateIncidentDetails } from '@/lib/api/endpoints/incidents';
import { queryKeys } from '@/lib/api/query-keys';
import type { DisasterType, Incident, IncidentDetail, IncidentDetailsPatch } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import {
  IncidentTypePicker,
  MAX_ADDRESS_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  PeopleCounter,
  VulnerabilityToggles,
  type VulnerabilityFlags,
} from './fields';

export interface IncidentDetailsCardProps {
  incident: IncidentDetail;
  canEdit: boolean;
  startEditing: boolean;
}

export function IncidentDetailsCard({ incident, canEdit, startEditing }: IncidentDetailsCardProps) {
  const [isEditing, setEditing] = useState(canEdit && startEditing);
  const showEditor = canEdit && isEditing;

  return (
    <Panel
      title={showEditor ? 'Tell responders more' : 'Details'}
      action={
        canEdit &&
        !showEditor && (
          <Button type="button" variant="outline" className="h-11" onClick={() => setEditing(true)}>
            <SquarePen />
            {hasReporterDetails(incident) ? 'Edit' : 'Add details'}
          </Button>
        )
      }
    >
      {showEditor ? (
        <DetailsEditor incident={incident} onDone={() => setEditing(false)} />
      ) : (
        <DetailsSummary incident={incident} />
      )}
    </Panel>
  );
}

function DetailsSummary({ incident }: { incident: Incident }) {
  const vulnerable = [
    incident.hasElderly && 'Elderly people',
    incident.hasChildren && 'Children',
    incident.hasInjured && 'Someone injured',
  ].filter(Boolean);

  return (
    <dl className="grid gap-3 text-base">
      <SummaryRow term="What">{describeWhat(incident)}</SummaryRow>
      <SummaryRow term="People">{formatCount(incident.peopleAffected)}</SummaryRow>
      <SummaryRow term="Vulnerable">{vulnerable.length > 0 ? vulnerable.join(', ') : 'None reported'}</SummaryRow>
      {incident.description && (
        <SummaryRow term="Description">
          <span className="whitespace-pre-line">{incident.description}</span>
        </SummaryRow>
      )}
    </dl>
  );
}

function SummaryRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm font-medium text-foreground/70">{term}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function DetailsEditor({ incident, onDone }: { incident: IncidentDetail; onDone: () => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [type, setType] = useState<DisasterType>(incident.type);
  const [peopleAffected, setPeopleAffected] = useState(incident.peopleAffected);
  const [vulnerability, setVulnerability] = useState<VulnerabilityFlags>({
    hasElderly: incident.hasElderly,
    hasChildren: incident.hasChildren,
    hasInjured: incident.hasInjured,
  });
  const [description, setDescription] = useState(incident.description ?? '');
  const [addressText, setAddressText] = useState(incident.addressText ?? '');

  const save = useMutation({
    mutationFn: (patch: IncidentDetailsPatch) => updateIncidentDetails(incident.id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<IncidentDetail>(
        queryKeys.incidents.detail(incident.id),
        (current) => current && { ...updated, timeline: current.timeline },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.mine });
      toast({ title: 'Details sent', description: 'Responders can see what you added.', variant: 'success' });
      onDone();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch = changedDetails(incident, {
      type,
      peopleAffected,
      ...vulnerability,
      description: description.trim(),
      addressText: addressText.trim(),
    });
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    save.mutate(patch);
  };

  return (
    <form className="grid gap-5" onSubmit={submit} noValidate>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-base font-semibold">What is happening?</legend>
        <IncidentTypePicker name={`${formId}-type`} value={type} onChange={setType} />
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-people`} className="text-base font-semibold">
          Number of people who need help
        </Label>
        <PeopleCounter id={`${formId}-people`} value={peopleAffected} onChange={setPeopleAffected} />
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-base font-semibold">Anyone vulnerable?</legend>
        <VulnerabilityToggles value={vulnerability} onChange={setVulnerability} />
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-description`} className="text-base font-semibold">
          What do you see?
        </Label>
        <Textarea
          id={`${formId}-description`}
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={3}
          className="min-h-24 text-base md:text-base"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-address`} className="text-base font-semibold">
          Landmark or address
        </Label>
        <Input
          id={`${formId}-address`}
          value={addressText}
          maxLength={MAX_ADDRESS_LENGTH}
          className="h-12 text-base"
          onChange={(event) => setAddressText(event.target.value)}
        />
      </div>
      {save.isError && (
        <Alert variant="destructive" className="border-destructive/60">
          <CircleAlert />
          <AlertDescription className="text-base text-foreground">{describeApiError(save.error)}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2 min-[400px]:grid-cols-2">
        <Button type="submit" size="xl" disabled={save.isPending}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Send details
        </Button>
        <Button type="button" size="xl" variant="outline" onClick={onDone} disabled={save.isPending}>
          Not now
        </Button>
      </div>
    </form>
  );
}

interface EditableDetails extends VulnerabilityFlags {
  type: DisasterType;
  peopleAffected: number;
  description: string;
  addressText: string;
}

// Blank text is left out rather than sent: the API would store the empty string over what responders already read.
function changedDetails(incident: Incident, next: EditableDetails): IncidentDetailsPatch {
  const patch: IncidentDetailsPatch = {};
  if (next.type !== incident.type) patch.type = next.type;
  if (next.peopleAffected !== incident.peopleAffected) patch.peopleAffected = next.peopleAffected;
  if (next.hasElderly !== incident.hasElderly) patch.hasElderly = next.hasElderly;
  if (next.hasChildren !== incident.hasChildren) patch.hasChildren = next.hasChildren;
  if (next.hasInjured !== incident.hasInjured) patch.hasInjured = next.hasInjured;
  if (next.description && next.description !== incident.description) patch.description = next.description;
  if (next.addressText && next.addressText !== incident.addressText) patch.addressText = next.addressText;
  return patch;
}

function describeWhat(incident: Incident): string {
  if (!incident.isSos) return DISASTER_TYPE_LABELS[incident.type];
  return incident.type === 'OTHER' ? 'SOS (kind of emergency not given yet)' : `SOS · ${DISASTER_TYPE_LABELS[incident.type]}`;
}

function hasReporterDetails(incident: Incident): boolean {
  return incident.type !== 'OTHER' || incident.description !== null || incident.hasElderly || incident.hasChildren || incident.hasInjured;
}
