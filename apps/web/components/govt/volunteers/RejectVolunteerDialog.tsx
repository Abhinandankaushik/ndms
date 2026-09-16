'use client';

import { useId, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { VolunteerApplication } from '@/lib/api/types';
import { ConfirmDialog } from '../common/ConfirmDialog';

const REASON_MAX_LENGTH = 1_000;

export function RejectVolunteerDialog({
  application,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  application: VolunteerApplication | null;
  isPending: boolean;
  error: unknown;
  onConfirm: (application: VolunteerApplication, reason: string) => void;
  onClose: () => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [reasonForUserId, setReasonForUserId] = useState<string | null>(null);
  if (application && application.userId !== reasonForUserId) {
    setReasonForUserId(application.userId);
    setReason('');
  }
  const name = application?.fullName ?? 'this applicant';

  return (
    <ConfirmDialog
      open={application !== null}
      onOpenChange={(open) => {
        if (open) return;
        setReason('');
        onClose();
      }}
      title={`Reject ${name}?`}
      description="The applicant sees the reason, so write it so they can fix the problem and apply again."
      confirmLabel="Reject application"
      destructive
      isPending={isPending}
      error={error}
      confirmDisabled={reason.trim() === ''}
      onConfirm={() => {
        if (application && reason.trim()) onConfirm(application, reason.trim());
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={reasonId}>Reason (required)</Label>
        <Textarea
          id={reasonId}
          value={reason}
          required
          maxLength={REASON_MAX_LENGTH}
          placeholder="e.g. The ID document is unreadable. Upload a clearer photo."
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
