'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { flagIncident } from '@/lib/api/endpoints/incidents';
import { REVIEW_REASONS, type Incident, type ReviewReason } from '@/lib/api/types';
import { REVIEW_REASON_LABELS } from '@/lib/labels';
import { describeError, hasErrorCode } from '../lib/errors';
import { isUuid } from '../lib/workflow';
import { syncReviewCreated } from '../realtime/cache-sync';
import { DuplicatePicker } from './DuplicatePicker';

const NOTE_MAX_LENGTH = 1_000;

const REASON_HINTS: Record<ReviewReason, string> = {
  POSSIBLE_DUPLICATE: 'Another report seems to describe the same event.',
  POSSIBLE_FAKE: 'Details do not add up; someone should check before responders go.',
  LOCATION_UNCERTAIN: 'The position looks wrong or too vague to send a team.',
  OTHER: 'Anything else a second official should look at.',
};

export function FlagIncidentDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: Incident;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <FlagIncidentForm incident={incident} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function FlagIncidentForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const noteId = useId();
  const [reason, setReason] = useState<ReviewReason>('POSSIBLE_DUPLICATE');
  const [relatedIncidentId, setRelatedIncidentId] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      flagIncident(incident.id, {
        reason,
        relatedIncidentId: reason === 'POSSIBLE_DUPLICATE' && isUuid(relatedIncidentId) ? relatedIncidentId : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      syncReviewCreated(queryClient);
      toast({
        title: 'Flagged for review',
        description: 'It is waiting on the Reviews page. The incident status is unchanged.',
        variant: 'success',
      });
      onDone();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };

  return (
    <DialogContent className={reason === 'POSSIBLE_DUPLICATE' ? 'sm:max-w-xl' : undefined}>
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>Flag for review</DialogTitle>
          <DialogDescription>
            Sends the incident to the review queue for a human decision. Nothing is rejected automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={reasonId}>Reason</Label>
          <Select value={reason} onValueChange={(value) => setReason(value as ReviewReason)}>
            <SelectTrigger id={reasonId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_REASONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {REVIEW_REASON_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{REASON_HINTS[reason]}</p>
        </div>

        {reason === 'POSSIBLE_DUPLICATE' && (
          <DuplicatePicker incident={incident} value={relatedIncidentId} onChange={setRelatedIncidentId} />
        )}

        <div className="grid gap-2">
          <Label htmlFor={noteId}>Note (optional)</Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="What should the reviewer check?"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {mutation.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {hasErrorCode(mutation.error, 'REVIEW_ALREADY_PENDING')
                ? 'This incident is already waiting for review for that reason.'
                : describeError(mutation.error)}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="animate-spin" />}
            Flag for review
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
