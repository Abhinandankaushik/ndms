'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheckBig, Hourglass, LoaderCircle, Send, Siren } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { describeApiError, retryAfterSentence } from '@/components/citizen/common/api-errors';
import { CitizenPage, OfflineNotice, PageHeader } from '@/components/citizen/common/page';
import {
  IncidentTypePicker,
  MAX_ADDRESS_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  PeopleCounter,
  VulnerabilityToggles,
  type VulnerabilityFlags,
} from '@/components/citizen/incidents/fields';
import { LocationField, type ChosenLocation } from '@/components/citizen/location/LocationField';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/api/query-keys';
import type { DisasterType, ReportInput } from '@/lib/api/types';
import { createClientUuid } from '@/lib/client-uuid';
import {
  MAX_PHOTOS_PER_BATCH,
  PhotoInputButton,
  SelectedPhotoGrid,
  type SelectedPhoto,
} from './photo-components';
import { queuePhotoUploads } from './photo-uploads';
import { submitReport } from './submit';

interface ReportDraft {
  type: DisasterType | null;
  location: ChosenLocation | null;
  addressText: string;
  peopleAffected: number;
  vulnerability: VulnerabilityFlags;
  description: string;
}

const EMPTY_DRAFT: ReportDraft = {
  type: null,
  location: null,
  addressText: '',
  peopleAffected: 1,
  vulnerability: { hasElderly: false, hasChildren: false, hasInjured: false },
  description: '',
};

type SubmitState = { kind: 'editing' } | { kind: 'submitting' } | { kind: 'sent' } | { kind: 'queued' };

export function ReportForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formId = useId();
  // One idempotency key for the whole form: a retry after an ambiguous failure must not create a second report.
  const [clientUuid] = useState(createClientUuid);
  const firstAttemptAt = useRef<string | null>(null);
  const typeFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [isTypeMissing, setTypeMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'editing' });
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    [],
  );

  const update = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const addPhotos = (files: File[]) => {
    setPhotoNotice(null);
    const added = files.map((file) => ({ id: createClientUuid(), file, previewUrl: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...added]);
  };

  const removePhoto = (id: string) => {
    const removed = photos.find((photo) => photo.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState.kind !== 'editing') return;
    if (!draft.type) {
      setTypeMissing(true);
      typeFieldsetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitError(null);
    setSubmitState({ kind: 'submitting' });
    firstAttemptAt.current ??= new Date().toISOString();
    try {
      const outcome = await submitReport(buildReport(clientUuid, firstAttemptAt.current, draft.type, draft));
      if (outcome.kind === 'queued') {
        setSubmitState({ kind: 'queued' });
        return;
      }
      setSubmitState({ kind: 'sent' });
      if (photos.length > 0) queuePhotoUploads(outcome.receipt.id, photos.map((photo) => photo.file));
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.mine });
      router.push(`/citizen/incidents/${encodeURIComponent(outcome.receipt.id)}?sent=report`);
    } catch (error) {
      setSubmitError(describeReportError(error));
      setSubmitState({ kind: 'editing' });
    }
  };

  if (submitState.kind === 'queued') {
    return <QueuedReport hadPhotos={photos.length > 0} />;
  }

  const isLocked = submitState.kind !== 'editing';

  return (
    <CitizenPage>
      <PageHeader
        title="Report an incident"
        description="Details and photos help responders decide who to send. If someone is in danger right now, use SOS."
      />
      <OfflineNotice>Reports need a connection to send. Calls to 112 work without mobile data.</OfflineNotice>

      <form className="grid gap-7" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <FormSection
          ref={typeFieldsetRef}
          legend="What is happening?"
          hint={isTypeMissing && !draft.type ? 'Choose the kind of incident to continue.' : undefined}
          hintIsError
        >
          <IncidentTypePicker
            name={`${formId}-type`}
            value={draft.type}
            invalid={isTypeMissing && !draft.type}
            onChange={(type) => update('type', type)}
          />
        </FormSection>

        <FormSection legend="Where is it?" hint="Use your location if you are at the place. Otherwise pick it on the map.">
          <LocationField
            value={draft.location}
            onChange={(location) => update('location', location)}
            pinTitle="Where is the incident?"
          />
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-address`} className="text-base">
              Landmark or address (optional)
            </Label>
            <Input
              id={`${formId}-address`}
              value={draft.addressText}
              maxLength={MAX_ADDRESS_LENGTH}
              autoComplete="street-address"
              placeholder="Near the temple, ward 12"
              className="h-12 text-base"
              onChange={(event) => update('addressText', event.target.value)}
            />
          </div>
        </FormSection>

        <FormSection legend="Who needs help?">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-people`} className="text-base">
              Number of people
            </Label>
            <PeopleCounter
              id={`${formId}-people`}
              value={draft.peopleAffected}
              onChange={(value) => update('peopleAffected', value)}
            />
          </div>
          <VulnerabilityToggles value={draft.vulnerability} onChange={(value) => update('vulnerability', value)} />
        </FormSection>

        <div className="grid gap-2">
          <Label htmlFor={`${formId}-description`} className="text-lg font-semibold">
            What do you see? (optional)
          </Label>
          <Textarea
            id={`${formId}-description`}
            value={draft.description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={4}
            placeholder="Water is up to the roof of our house. Two people cannot walk."
            aria-describedby={`${formId}-description-count`}
            className="min-h-28 text-base md:text-base"
            onChange={(event) => update('description', event.target.value)}
          />
          <p id={`${formId}-description-count`} className="text-right text-sm text-foreground/70">
            {draft.description.length} / {MAX_DESCRIPTION_LENGTH}
          </p>
        </div>

        <FormSection
          legend="Photos (optional)"
          hint="Photos are made smaller and uploaded after the report is sent. A photo that fails never stops the report."
        >
          <SelectedPhotoGrid photos={photos} onRemove={removePhoto} />
          <PhotoInputButton
            label={photos.length === 0 ? 'Add photos' : `Add more photos (${photos.length} of ${MAX_PHOTOS_PER_BATCH})`}
            remaining={MAX_PHOTOS_PER_BATCH - photos.length}
            onSelect={addPhotos}
            onRejected={setPhotoNotice}
            disabled={isLocked}
          />
          {photoNotice && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {photoNotice}
            </p>
          )}
        </FormSection>

        {submitError && (
          <Alert variant="destructive" className="border-destructive/60">
            <CircleAlert />
            <AlertTitle className="line-clamp-none text-base">The report was not sent</AlertTitle>
            <AlertDescription className="text-base text-foreground">{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3">
          <Button type="submit" size="xl" className="h-14 w-full text-lg" disabled={isLocked}>
            {submitState.kind === 'sent' ? (
              <CircleCheckBig className="size-5" />
            ) : submitState.kind === 'submitting' ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
            {submitState.kind === 'sent' ? 'Report sent' : submitState.kind === 'submitting' ? 'Sending…' : 'Send report'}
          </Button>
          <Button asChild variant="outline" size="xl" className="w-full">
            <Link href="/citizen">
              <Siren className="size-5" />
              Go to SOS instead
            </Link>
          </Button>
        </div>
      </form>
    </CitizenPage>
  );
}

interface FormSectionProps {
  legend: string;
  hint?: string;
  hintIsError?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLFieldSetElement>;
}

function FormSection({ legend, hint, hintIsError = false, children, ref }: FormSectionProps) {
  return (
    <fieldset ref={ref} className="min-w-0">
      <legend className="mb-1 text-lg font-semibold">{legend}</legend>
      {hint && (
        <p role={hintIsError ? 'alert' : undefined} className={hintIsError ? 'mb-3 font-medium text-destructive' : 'mb-3 text-sm text-foreground/80'}>
          {hint}
        </p>
      )}
      <div className="grid gap-3">{children}</div>
    </fieldset>
  );
}

function QueuedReport({ hadPhotos }: { hadPhotos: boolean }) {
  return (
    <CitizenPage>
      <Alert variant="warning">
        <Hourglass />
        <AlertTitle className="line-clamp-none text-base">Report saved on this phone</AlertTitle>
        <AlertDescription className="text-base">
          <p>It will be sent automatically as soon as you have a connection.</p>
          {hadPhotos && <p>Photos can be added from My reports once the report has been sent.</p>}
        </AlertDescription>
      </Alert>
      <Button asChild size="xl" className="w-full">
        <Link href="/citizen/incidents">Go to My reports</Link>
      </Button>
    </CitizenPage>
  );
}

function buildReport(clientUuid: string, reportedAt: string, type: DisasterType, draft: ReportDraft): ReportInput {
  const description = draft.description.trim();
  const addressText = draft.addressText.trim();
  return {
    clientUuid,
    reportedAt,
    type,
    peopleAffected: draft.peopleAffected,
    ...draft.vulnerability,
    ...(description ? { description } : {}),
    ...(addressText ? { addressText } : {}),
    ...locationFields(draft.location),
  };
}

function locationFields(location: ChosenLocation | null): Pick<ReportInput, 'lat' | 'lon' | 'accuracyM' | 'locationSource'> {
  if (!location) return {};
  if (location.source === 'MANUAL_PIN') return { lat: location.lat, lon: location.lon, locationSource: 'MANUAL_PIN' };
  return { lat: location.lat, lon: location.lon, accuracyM: location.accuracyM, locationSource: 'GPS' };
}

function describeReportError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    return `You have sent the most reports allowed in an hour. ${retryAfterSentence(error)} If someone is in danger now, use SOS or call 112.`;
  }
  if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
    return 'Some details were not accepted. Check the form and try again.';
  }
  return describeApiError(error, 'Your report could not be sent. Please try again.');
}
