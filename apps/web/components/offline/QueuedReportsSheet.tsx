'use client';

import { CircleAlert, Hourglass, RefreshCw, Send, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/components/citizen/common/format';
import { useIsOnline, useNow } from '@/components/citizen/common/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { drainOutbox, flushOutboxNow } from '@/lib/offline/drain';
import { removeEntries, retryEntry } from '@/lib/offline/outbox';
import type { OutboxEntry } from '@/lib/offline/types';
import { entryStatusText, entryTitle } from './entry-presentation';

interface QueuedReportsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waiting: readonly OutboxEntry[];
  blocked: readonly OutboxEntry[];
  isSending: boolean;
}

export function QueuedReportsSheet({ open, onOpenChange, waiting, blocked, isSending }: QueuedReportsSheetProps) {
  const isOnline = useIsOnline();
  const now = useNow(15_000);
  const entries = [...waiting, ...blocked];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-xl p-0">
        <SheetHeader className="pr-12">
          <SheetTitle>Saved on this phone</SheetTitle>
          <SheetDescription>
            Nothing here is deleted until NDMS confirms it has the report, so sending twice is safe.
          </SheetDescription>
        </SheetHeader>

        <ul className="min-h-0 flex-1 overflow-y-auto border-t px-4 py-3">
          {entries.map((entry) => (
            <QueuedReportRow key={entry.clientUuid} entry={entry} isOnline={isOnline} now={now} />
          ))}
          {entries.length === 0 && <li className="py-6 text-center text-muted-foreground">Everything has been sent.</li>}
        </ul>

        <SheetFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="lg"
            disabled={!isOnline || isSending || waiting.length === 0}
            onClick={() => void flushOutboxNow()}
          >
            <Send />
            {isSending ? 'Sending…' : 'Send now'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function QueuedReportRow({ entry, isOnline, now }: { entry: OutboxEntry; isOnline: boolean; now: number }) {
  const isBlocked = entry.status !== 'PENDING';

  return (
    <li className="grid gap-2 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {isBlocked ? (
          <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
        ) : (
          <Hourglass aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{entryTitle(entry)}</span>
        <span className="shrink-0 text-sm text-muted-foreground">{formatRelativeTime(entry.body.reportedAt, now)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isBlocked ? 'destructive' : 'warning'}>{entryStatusText(entry, isOnline)}</Badge>
        {entry.attempts > 0 && (
          <span className="text-sm text-muted-foreground">
            {entry.attempts} {entry.attempts === 1 ? 'try' : 'tries'}
          </span>
        )}
      </div>

      {entry.lastError && <p className="text-sm text-foreground/80">{entry.lastError}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void retryNow(entry.clientUuid)}>
          <RefreshCw />
          Try again
        </Button>
        {isBlocked && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntries([entry.clientUuid])}>
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}

async function retryNow(clientUuid: string): Promise<void> {
  await retryEntry(clientUuid);
  await drainOutbox();
}
