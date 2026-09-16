'use client';

import {
  Ban,
  Check,
  CircleAlert,
  ClipboardCheck,
  LoaderCircle,
  MapPinCheck,
  RotateCw,
  ThumbsUp,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import type { MissionStatus } from '@/lib/api/types';
import { MISSION_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { STEP_COPY, type TeamStepStatus } from './mission-flow';
import type { StepFailure } from './step-failure';

export interface StepDialogState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  failure: StepFailure | null;
  currentStatus: MissionStatus;
}

export const STEP_BUTTON_STYLE: Record<TeamStepStatus, string> = {
  ACCEPTED: 'bg-emerald-700 text-white hover:bg-emerald-800',
  REJECTED: 'bg-red-700 text-white hover:bg-red-800',
  EN_ROUTE: 'bg-slate-900 text-white hover:bg-slate-800',
  ON_SITE: 'bg-slate-900 text-white hover:bg-slate-800',
  COMPLETED: 'bg-slate-900 text-white hover:bg-slate-800',
};

const STEP_ICONS: Record<TeamStepStatus, LucideIcon> = {
  ACCEPTED: ThumbsUp,
  REJECTED: Ban,
  EN_ROUTE: Truck,
  ON_SITE: MapPinCheck,
  COMPLETED: ClipboardCheck,
};

export function StepIcon({ step, className }: { step: TeamStepStatus; className?: string }) {
  const Icon = STEP_ICONS[step];
  return <Icon aria-hidden className={className} />;
}

export function StepFailureNotice({
  failure,
  currentStatus,
  onRetry,
  onDismiss,
}: {
  failure: StepFailure;
  currentStatus: MissionStatus;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="grid gap-2 rounded-lg border-2 border-red-700 bg-red-50 p-3 text-red-950">
      <p className="flex items-center gap-2 text-base font-bold">
        <CircleAlert aria-hidden className="size-5 shrink-0" />
        {failure.title}
      </p>
      <p className="text-sm font-medium">
        {failure.message} Status confirmed by NDMS: <strong>{MISSION_STATUS_LABELS[currentStatus]}</strong>.
      </p>
      {(onRetry || onDismiss) && (
        <div className="grid grid-cols-2 gap-2">
          {onDismiss && (
            <Button
              type="button"
              variant="outline"
              className={cn('h-12 border-2 border-red-700 bg-white text-base font-bold', !onRetry && 'col-span-2')}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
          {onRetry && (
            <Button
              type="button"
              className={cn('h-12 bg-red-700 text-base font-bold text-white hover:bg-red-800', !onDismiss && 'col-span-2')}
              onClick={onRetry}
            >
              <RotateCw aria-hidden className="size-5" />
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function StepDialogButtons({
  step,
  pending,
  failure,
  onCancel,
  onConfirm,
}: {
  step: TeamStepStatus;
  pending: boolean;
  failure: StepFailure | null;
  onCancel: () => void;
  /** Omit inside a form: the confirm button then submits it. */
  onConfirm?: () => void;
}) {
  const copy = STEP_COPY[step];
  // Repeating a refused step cannot help, but a form can still be corrected and sent.
  const showConfirm = !failure || failure.retryable || !onConfirm;

  return (
    <DialogFooter className="gap-3">
      <Button type="button" variant="outline" className="h-14 border-2 border-slate-900 text-base font-bold" onClick={onCancel}>
        {pending || failure ? 'Close' : 'Not now'}
      </Button>
      {showConfirm && (
        <Button
          type={onConfirm ? 'button' : 'submit'}
          onClick={onConfirm}
          disabled={pending}
          className={cn('h-16 text-lg font-bold', STEP_BUTTON_STYLE[step])}
        >
          {pending ? <LoaderCircle aria-hidden className="size-6 animate-spin" /> : <StepIcon step={step} className="size-6" />}
          {pending ? copy.pending : failure?.retryable ? 'Try again' : copy.confirm}
        </Button>
      )}
    </DialogFooter>
  );
}

export function ChoiceButton({
  pressed,
  onClick,
  disabled,
  className,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-auto min-h-14 border-2 border-slate-900 py-3 text-base font-bold whitespace-normal',
        pressed && 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white',
        className,
      )}
    >
      {pressed && <Check aria-hidden className="size-5" />}
      {children}
    </Button>
  );
}
