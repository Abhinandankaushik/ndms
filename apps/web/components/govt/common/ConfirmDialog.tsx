'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { describeError } from '../lib/errors';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
  /** A caught error, or a message already written for this dialog. */
  error?: unknown;
  destructive?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending = false,
  error,
  destructive = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error != null && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{typeof error === 'string' ? error : describeError(error)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={isPending || confirmDisabled}>
            {isPending && <LoaderCircle className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
