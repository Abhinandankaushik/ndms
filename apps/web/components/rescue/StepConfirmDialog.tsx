'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { STEP_COPY, type TeamStepStatus } from './mission-flow';
import { StepDialogButtons, StepFailureNotice, type StepDialogState } from './StepDialogParts';

export interface StepConfirmDialogProps extends StepDialogState {
  step: Extract<TeamStepStatus, 'ACCEPTED' | 'EN_ROUTE' | 'ON_SITE'>;
  onConfirm: () => void;
}

export function StepConfirmDialog({
  step,
  open,
  onOpenChange,
  pending,
  failure,
  currentStatus,
  onConfirm,
}: StepConfirmDialogProps) {
  const copy = STEP_COPY[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="text-2xl leading-tight font-bold">{copy.question}</DialogTitle>
          <DialogDescription className="text-base text-foreground">{copy.consequence}</DialogDescription>
        </DialogHeader>
        {failure && <StepFailureNotice failure={failure} currentStatus={currentStatus} />}
        <StepDialogButtons
          step={step}
          pending={pending}
          failure={failure}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
