'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { changeIncidentStatus } from '@/lib/api/endpoints/incidents';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident, IncidentStatus } from '@/lib/api/types';
import { INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { IncidentStatusBadge } from '../common/badges';
import { describeError, hasErrorCode } from '../lib/errors';
import { STATUS_ACTION_LABELS, isRejection, isUuid } from '../lib/workflow';
import { syncIncidentRecord } from '../realtime/cache-sync';
import { DuplicatePicker } from './DuplicatePicker';

const NOTE_MAX_LENGTH = 1_000;

export function StatusChangeDialog({
  incident,
  target,
  suggestedDuplicateOf,
  onClose,
}: {
  incident: Incident;
  target: IncidentStatus | null;
  suggestedDuplicateOf?: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && (
        <StatusChangeForm
          key={target}
          incident={incident}
          target={target}
          suggestedDuplicateOf={suggestedDuplicateOf ?? null}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}

function StatusChangeForm({
  incident,
  target,
  suggestedDuplicateOf,
  onDone,
}: {
  incident: Incident;
  target: IncidentStatus;
  suggestedDuplicateOf: string | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');
  const rejection = isRejection(target);
  const needsOriginal = target === 'REJECTED_DUPLICATE';
  // Every rejection is a named human decision (CLAUDE.md rule 8), so it has to say why.
  const canSubmit = (!rejection || note.trim().length > 0) && (!needsOriginal || isUuid(duplicateOf));

  const mutation = useMutation({
    mutationFn: () =>
      changeIncidentStatus(incident.id, {
        status: target,
        note: note.trim() || undefined,
        duplicateOf: needsOriginal ? duplicateOf : undefined,
      }),
    onSuccess: (updated) => {
      syncIncidentRecord(queryClient, updated);
      toast({ title: `Status changed to ${INCIDENT_STATUS_LABELS[updated.status].toLowerCase()}`, variant: 'success' });
      onDone();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'INVALID_TRANSITION')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incident.id) });
      }
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit && !mutation.isPending) mutation.mutate();
  };

  return (
    <DialogContent className={needsOriginal ? 'sm:max-w-xl' : undefined}>
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>{STATUS_ACTION_LABELS[target]}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <IncidentStatusBadge status={incident.status} />
            <ArrowRight aria-label="to" className="size-4" />
            <IncidentStatusBadge status={target} />
          </DialogDescription>
        </DialogHeader>

        {needsOriginal && (
          <DuplicatePicker
            incident={incident}
            value={duplicateOf}
            onChange={setDuplicateOf}
            suggestedId={suggestedDuplicateOf}
          />
        )}

        <div className="grid gap-2">
          <Label htmlFor={noteId}>{rejection ? 'Reason (required)' : 'Note (optional)'}</Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            required={rejection}
            placeholder={
              rejection ? 'What shows this report should be rejected? Recorded in the incident history.' : 'Recorded in the incident history.'
            }
            onChange={(event) => setNote(event.target.value)}
          />
          {rejection && (
            <p className="text-xs text-muted-foreground">
              The reporter sees the new status. The decision is recorded against your account and can be reopened.
            </p>
          )}
        </div>

        {mutation.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {hasErrorCode(mutation.error, 'INVALID_TRANSITION')
                ? 'The incident changed while this was open. Its details have been refreshed; check them and try again.'
                : describeError(mutation.error)}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant={rejection ? 'destructive' : 'default'} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="animate-spin" />}
            {STATUS_ACTION_LABELS[target]}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
