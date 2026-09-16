'use client';

import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Mission } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { CompleteMissionDialog } from './CompleteMissionDialog';
import { STEP_COPY, teamStepsFrom, type TeamStepStatus } from './mission-flow';
import { RejectMissionDialog } from './RejectMissionDialog';
import { StepConfirmDialog } from './StepConfirmDialog';
import { STEP_BUTTON_STYLE, StepFailureNotice, StepIcon, type StepDialogState } from './StepDialogParts';
import { describeStepFailure } from './step-failure';
import { useMissionStatusChange, type TeamStatusChange } from './useMissionStatusChange';

/**
 * The team's next steps, pinned above the bottom navigation. The mission status shown elsewhere is always the one
 * NDMS confirmed; this bar reports a step that is still sending or that failed, and offers the retry.
 */
export function MissionActions({ mission }: { mission: Mission }) {
  const steps = teamStepsFrom(mission.status);
  const statusChange = useMissionStatusChange(mission.id);
  const [requestedStep, setRequestedStep] = useState<TeamStepStatus | null>(null);

  const attempt = statusChange.variables;
  const pendingStep = statusChange.isPending && attempt ? attempt.status : null;
  // A failure stops mattering once NDMS confirms that step anyway, for example when a slow response lands after
  // the timeout, or once the mission has moved somewhere the step no longer applies.
  const failedAttempt =
    statusChange.isError && attempt && attempt.status !== mission.status && steps.includes(attempt.status)
      ? attempt
      : undefined;
  const failure = failedAttempt ? describeStepFailure(statusChange.error) : null;
  const openStep = requestedStep !== null && steps.includes(requestedStep) ? requestedStep : null;

  if (steps.length === 0) return null;

  const send = (change: TeamStatusChange) => {
    statusChange.mutate(change, { onSuccess: () => setRequestedStep(null) });
  };

  const dialogState = (step: TeamStepStatus): StepDialogState => ({
    open: openStep === step,
    onOpenChange: (open) => setRequestedStep(open ? step : null),
    pending: pendingStep === step,
    failure: failedAttempt?.status === step ? failure : null,
    currentStatus: mission.status,
  });

  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-auto grid gap-3 border-t-2 border-slate-900 bg-background px-4 pt-3 pb-4">
      {pendingStep && (
        <p role="status" className="flex items-center gap-2 text-base font-bold">
          <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin" />
          {STEP_COPY[pendingStep].pending} Waiting for NDMS to confirm.
        </p>
      )}
      {failure && failedAttempt && openStep === null && (
        <StepFailureNotice
          failure={failure}
          currentStatus={mission.status}
          onRetry={failure.retryable ? () => send(failedAttempt) : undefined}
          onDismiss={() => statusChange.reset()}
        />
      )}

      <div className="grid gap-2">
        {steps.map((step) => (
          <StepButton
            key={step}
            step={step}
            secondary={step === 'REJECTED'}
            pending={pendingStep === step}
            disabled={pendingStep !== null}
            onClick={() => setRequestedStep(step)}
          />
        ))}
      </div>

      {steps.map((step) => {
        switch (step) {
          case 'ACCEPTED':
          case 'EN_ROUTE':
          case 'ON_SITE':
            return (
              <StepConfirmDialog key={step} step={step} {...dialogState(step)} onConfirm={() => send({ status: step })} />
            );
          case 'REJECTED':
            return (
              <RejectMissionDialog
                key={step}
                {...dialogState(step)}
                previousAttempt={failedAttempt?.status === step ? failedAttempt : undefined}
                onSubmit={send}
              />
            );
          case 'COMPLETED':
            return (
              <CompleteMissionDialog
                key={step}
                {...dialogState(step)}
                previousAttempt={failedAttempt?.status === step ? failedAttempt : undefined}
                onSubmit={send}
              />
            );
        }
      })}
    </div>
  );
}

function StepButton({
  step,
  secondary,
  pending,
  disabled,
  onClick,
}: {
  step: TeamStepStatus;
  secondary: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const copy = STEP_COPY[step];

  return (
    <Button
      type="button"
      variant={secondary ? 'outline' : 'default'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full font-bold',
        secondary
          ? 'h-14 border-2 border-red-700 bg-white text-base text-red-700 hover:bg-red-50 hover:text-red-800'
          : cn('h-16 text-lg', STEP_BUTTON_STYLE[step]),
      )}
    >
      {pending ? (
        <LoaderCircle aria-hidden className="size-6 animate-spin" />
      ) : (
        <StepIcon step={step} className="size-6" />
      )}
      {pending ? copy.pending : copy.action}
    </Button>
  );
}
