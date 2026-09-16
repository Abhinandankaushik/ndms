import { Check, LoaderCircle } from 'lucide-react';
import type { PendingDelta } from './delta-sync';

export function SaveStatus({ pending }: { pending: PendingDelta }) {
  const isSaving = pending.inFlight !== 0 || pending.queued !== 0;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {isSaving ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden className="size-3.5" />}
      {isSaving ? 'Saving…' : 'All changes saved'}
    </span>
  );
}
