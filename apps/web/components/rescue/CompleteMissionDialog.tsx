'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CountStepper } from './CountStepper';
import { STEP_COPY } from './mission-flow';
import { ChoiceButton, StepDialogButtons, StepFailureNotice, type StepDialogState } from './StepDialogParts';
import type { TeamStatusChange } from './useMissionStatusChange';

const MAX_COUNT = 100_000;
const MAX_NOTES_LENGTH = 2_000;

export interface CompleteMissionDialogProps extends StepDialogState {
  /** The last outcome sent, restored after a failed attempt so nothing has to be entered twice. */
  previousAttempt: TeamStatusChange | undefined;
  onSubmit: (change: TeamStatusChange) => void;
}

export function CompleteMissionDialog({ open, onOpenChange, ...formProps }: CompleteMissionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <CompleteMissionForm {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CompleteMissionForm({
  pending,
  failure,
  currentStatus,
  previousAttempt,
  onSubmit,
  onCancel,
}: Omit<CompleteMissionDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const rescuedId = useId();
  const rescuedHintId = useId();
  const injuredId = useId();
  const notesId = useId();
  const rescuedInput = useRef<HTMLDivElement>(null);
  const [peopleRescued, setPeopleRescued] = useState<number | null>(previousAttempt?.peopleRescued ?? null);
  const [injuredCount, setInjuredCount] = useState<number | null>(previousAttempt?.injuredCount ?? null);
  const [hospitalRequired, setHospitalRequired] = useState<boolean | null>(previousAttempt?.hospitalRequired ?? null);
  const [notes, setNotes] = useState(previousAttempt?.outcomeNotes ?? '');
  const [showMissingRescued, setShowMissingRescued] = useState(false);
  const rescuedMissing = showMissingRescued && peopleRescued === null;
  const copy = STEP_COPY.COMPLETED;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (peopleRescued === null) {
      setShowMissingRescued(true);
      rescuedInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const trimmedNotes = notes.trim();
    onSubmit({
      status: 'COMPLETED',
      peopleRescued,
      ...(injuredCount === null ? {} : { injuredCount }),
      ...(hospitalRequired === null ? {} : { hospitalRequired }),
      ...(trimmedNotes ? { outcomeNotes: trimmedNotes } : {}),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <DialogHeader className="text-left">
        <DialogTitle className="text-2xl leading-tight font-bold">{copy.question}</DialogTitle>
        <DialogDescription className="text-base text-foreground">{copy.consequence}</DialogDescription>
      </DialogHeader>

      <div ref={rescuedInput} className="grid gap-2">
        <Label htmlFor={rescuedId} className="text-base font-bold">
          People rescued (required)
        </Label>
        <CountStepper
          id={rescuedId}
          label="people rescued"
          value={peopleRescued}
          onChange={(value) => {
            setPeopleRescued(value);
            setShowMissingRescued(false);
          }}
          max={MAX_COUNT}
          invalid={rescuedMissing}
          describedBy={rescuedHintId}
          disabled={pending}
        />
        <p
          id={rescuedHintId}
          role={rescuedMissing ? 'alert' : undefined}
          className={cn('text-sm font-medium', rescuedMissing && 'text-base font-bold text-red-700')}
        >
          {rescuedMissing ? 'Enter how many people your team rescued. ' : ''}
          Enter 0 if nobody needed rescuing.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={injuredId} className="text-base font-bold">
          People injured
        </Label>
        <CountStepper
          id={injuredId}
          label="people injured"
          value={injuredCount}
          onChange={setInjuredCount}
          max={MAX_COUNT}
          disabled={pending}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-base font-bold">Hospital needed?</legend>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton pressed={hospitalRequired === true} onClick={() => setHospitalRequired(true)} disabled={pending}>
            Yes
          </ChoiceButton>
          <ChoiceButton pressed={hospitalRequired === false} onClick={() => setHospitalRequired(false)} disabled={pending}>
            No
          </ChoiceButton>
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={notesId} className="text-base font-bold">
          Notes (optional)
        </Label>
        <Textarea
          id={notesId}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={MAX_NOTES_LENGTH}
          rows={3}
          disabled={pending}
          className="border-2 border-slate-900 text-base md:text-base"
        />
      </div>

      {failure && <StepFailureNotice failure={failure} currentStatus={currentStatus} />}

      <StepDialogButtons step="COMPLETED" pending={pending} failure={failure} onCancel={onCancel} />
    </form>
  );
}
