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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { resolveReview } from '@/lib/api/endpoints/reviews';
import { queryKeys } from '@/lib/api/query-keys';
import type { PendingReview, ReviewOutcomeStatus } from '@/lib/api/types';
import { INCIDENT_STATUS_LABELS, REVIEW_REASON_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { DuplicatePicker } from '../incident/DuplicatePicker';
import { describeError, hasErrorCode } from '../lib/errors';
import { isRejection, isUuid, reviewOutcomesFrom } from '../lib/workflow';
import { syncReviewResolved } from '../realtime/cache-sync';

const NOTE_MAX_LENGTH = 1_000;

type Outcome = ReviewOutcomeStatus | 'UNCHANGED';

const OUTCOME_COPY: Record<Outcome, { label: string; hint: string }> = {
  UNCHANGED: { label: 'Leave the status as it is', hint: 'The report stays in the queue unchanged.' },
  VERIFIED: { label: 'Verify the report', hint: 'Confirmed genuine; ready for dispatch.' },
  RESOLVED: { label: 'Mark resolved', hint: 'Nothing further is needed.' },
  REJECTED_DUPLICATE: { label: 'Reject as a duplicate', hint: 'Closed and linked to the original incident.' },
  REJECTED_FAKE: { label: 'Reject as a false report', hint: 'Closed; the reporter sees the decision.' },
};

export function ResolveReviewDialog({ review, onClose }: { review: PendingReview | null; onClose: () => void }) {
  return (
    <Dialog open={review !== null} onOpenChange={(open) => !open && onClose()}>
      {review && <ResolveReviewForm key={review.id} review={review} onDone={onClose} />}
    </Dialog>
  );
}

function ResolveReviewForm({ review, onDone }: { review: PendingReview; onDone: () => void }) {
  const queryClient = useQueryClient();
  const noteId = useId();
  const outcomeName = useId();
  const [note, setNote] = useState('');
  // Rule 8: the dialog never proposes a rejection; the official has to choose one.
  const [outcome, setOutcome] = useState<Outcome>('UNCHANGED');
  const [duplicateOf, setDuplicateOf] = useState('');
  const outcomes: Outcome[] = ['UNCHANGED', ...reviewOutcomesFrom(review.incident.status)];
  const needsOriginal = outcome === 'REJECTED_DUPLICATE';
  const canSubmit = note.trim().length > 0 && (!needsOriginal || isUuid(duplicateOf));

  const mutation = useMutation({
    mutationFn: () =>
      resolveReview(review.id, {
        resolutionNote: note.trim(),
        incidentStatus: outcome === 'UNCHANGED' ? undefined : outcome,
        duplicateOf: needsOriginal ? duplicateOf : undefined,
      }),
    onSuccess: () => {
      syncReviewResolved(queryClient, review.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(review.incidentId) });
      toast({
        title: 'Review resolved',
        description:
          outcome === 'UNCHANGED'
            ? 'The incident status was left unchanged.'
            : `The incident is now ${INCIDENT_STATUS_LABELS[outcome].toLowerCase()}.`,
        variant: 'success',
      });
      onDone();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'REVIEW_ALREADY_RESOLVED')) syncReviewResolved(queryClient, review.id);
      if (hasErrorCode(error, 'INVALID_TRANSITION')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.pending });
      }
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit && !mutation.isPending) mutation.mutate();
  };

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>Resolve review</DialogTitle>
          <DialogDescription>
            {REVIEW_REASON_LABELS[review.reason]} · the incident is currently{' '}
            {INCIDENT_STATUS_LABELS[review.incident.status].toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Decision</legend>
          {outcomes.map((option) => (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50',
                outcome === option && 'border-primary bg-muted/60',
              )}
            >
              <input
                type="radio"
                name={outcomeName}
                checked={outcome === option}
                onChange={() => setOutcome(option)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="grid gap-0.5">
                <span className={cn('font-medium', option !== 'UNCHANGED' && isRejection(option) && 'text-destructive')}>
                  {OUTCOME_COPY[option].label}
                </span>
                <span className="text-xs text-muted-foreground">{OUTCOME_COPY[option].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsOriginal && (
          <DuplicatePicker
            incident={{
              id: review.incidentId,
              type: review.incident.type,
              lat: review.incident.lat,
              lon: review.incident.lon,
              reportedAt: review.incident.reportedAt,
            }}
            value={duplicateOf}
            onChange={setDuplicateOf}
            suggestedId={review.relatedIncidentId}
          />
        )}

        <div className="grid gap-2">
          <Label htmlFor={noteId}>Resolution note (required)</Label>
          <Textarea
            id={noteId}
            value={note}
            required
            maxLength={NOTE_MAX_LENGTH}
            placeholder="What did you check, and why this decision?"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {mutation.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {hasErrorCode(mutation.error, 'INVALID_TRANSITION')
                ? 'The incident changed status while you were deciding, so that outcome is no longer possible. The list has been refreshed.'
                : hasErrorCode(mutation.error, 'REVIEW_ALREADY_RESOLVED')
                  ? 'Another official already resolved this review.'
                  : describeError(mutation.error)}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={outcome !== 'UNCHANGED' && isRejection(outcome) ? 'destructive' : 'default'}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending && <LoaderCircle className="animate-spin" />}
            Resolve review
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
