'use client';

import { useId, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { STEP_COPY } from './mission-flow';
import { ChoiceButton, StepDialogButtons, StepFailureNotice, type StepDialogState } from './StepDialogParts';
import type { TeamStatusChange } from './useMissionStatusChange';

const MAX_REASON_LENGTH = 1_000;
const OTHER_REASON = 'OTHER';

// Ready-made reasons spare a gloved hand from typing in the common cases.
const COMMON_REASONS: readonly string[] = [
  'Team is committed to another rescue',
  'Cannot reach the location',
  'Missing equipment or skills for this rescue',
  'Vehicle or equipment breakdown',
];

export interface RejectMissionDialogProps extends StepDialogState {
  /** The last reason sent, restored after a failed attempt. */
  previousAttempt: TeamStatusChange | undefined;
  onSubmit: (change: TeamStatusChange) => void;
}

export function RejectMissionDialog({ open, onOpenChange, ...formProps }: RejectMissionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <RejectMissionForm {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RejectMissionForm({
  pending,
  failure,
  currentStatus,
  previousAttempt,
  onSubmit,
  onCancel,
}: Omit<RejectMissionDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const otherReasonId = useId();
  const errorId = useId();
  const previousReason = previousAttempt?.rejectionReason ?? '';
  const previousWasCommon = COMMON_REASONS.includes(previousReason);
  const [choice, setChoice] = useState<string | null>(
    previousReason === '' ? null : previousWasCommon ? previousReason : OTHER_REASON,
  );
  const [otherReason, setOtherReason] = useState(previousWasCommon ? '' : previousReason);
  const [showMissingReason, setShowMissingReason] = useState(false);
  const reason = (choice === OTHER_REASON ? otherReason : (choice ?? '')).trim();
  const copy = STEP_COPY.REJECTED;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason) {
      setShowMissingReason(true);
      return;
    }
    onSubmit({ status: 'REJECTED', rejectionReason: reason });
  };

  const choose = (next: string) => {
    setChoice(next);
    setShowMissingReason(false);
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <DialogHeader className="text-left">
        <DialogTitle className="text-2xl leading-tight font-bold">{copy.question}</DialogTitle>
        <DialogDescription className="text-base text-foreground">{copy.consequence}</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2" aria-describedby={showMissingReason ? errorId : undefined}>
        <legend className="mb-2 text-base font-bold">Reason</legend>
        {COMMON_REASONS.map((common) => (
          <ChoiceButton
            key={common}
            pressed={choice === common}
            onClick={() => choose(common)}
            disabled={pending}
            className="justify-start text-left"
          >
            {common}
          </ChoiceButton>
        ))}
        <ChoiceButton
          pressed={choice === OTHER_REASON}
          onClick={() => choose(OTHER_REASON)}
          disabled={pending}
          className="justify-start text-left"
        >
          Another reason
        </ChoiceButton>
      </fieldset>

      {choice === OTHER_REASON && (
        <div className="grid gap-2">
          <Label htmlFor={otherReasonId} className="text-base font-bold">
            Describe the reason
          </Label>
          <Textarea
            id={otherReasonId}
            value={otherReason}
            onChange={(event) => {
              setOtherReason(event.target.value);
              setShowMissingReason(false);
            }}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            autoFocus
            disabled={pending}
            aria-invalid={(showMissingReason && !reason) || undefined}
            aria-describedby={showMissingReason ? errorId : undefined}
            className="border-2 border-slate-900 text-base md:text-base"
          />
        </div>
      )}

      {showMissingReason && (
        <p id={errorId} role="alert" className="text-base font-bold text-red-700">
          Choose or type a reason so the control room knows why.
        </p>
      )}

      {failure && <StepFailureNotice failure={failure} currentStatus={currentStatus} />}

      <StepDialogButtons step="REJECTED" pending={pending} failure={failure} onCancel={onCancel} />
    </form>
  );
}
