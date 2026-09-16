'use client';

import { CircleAlert, CloudUpload, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useIsOnline } from '@/components/citizen/common/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { flushOutboxNow } from '@/lib/offline/drain';
import { useOutbox } from '@/lib/offline/use-outbox';
import { cn } from '@/lib/utils';
import { queueSummary } from './entry-presentation';
import { QueuedReportsSheet } from './QueuedReportsSheet';

/**
 * Sits above the portal header in the normal flow rather than over it: a person who has just sent an
 * SOS should not have the confirmation covered by a strip about the connection.
 */
export function OfflineStatusBar() {
  const isOnline = useIsOnline();
  const { waiting, blocked, isSending } = useOutbox();
  const [isListOpen, setListOpen] = useState(false);

  const queued = waiting.length + blocked.length;
  if (isOnline && queued === 0) return null;

  const Icon = blocked.length > 0 ? CircleAlert : isOnline ? CloudUpload : WifiOff;

  return (
    <>
      <div
        role="status"
        className={cn(
          'flex w-full items-center gap-2 px-4 py-1.5 text-sm font-medium',
          blocked.length > 0 ? 'bg-destructive text-white' : 'bg-warning text-warning-foreground',
        )}
      >
        <Icon aria-hidden className={cn('size-4 shrink-0', isSending && 'animate-pulse')} />
        <span className="min-w-0 flex-1 truncate">{queueSummary(waiting, blocked, isOnline, isSending)}</span>

        {isOnline && waiting.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 hover:bg-black/10"
            disabled={isSending}
            onClick={() => void flushOutboxNow()}
          >
            Send now
          </Button>
        )}
        {queued > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 gap-1.5 hover:bg-black/10"
            onClick={() => setListOpen(true)}
          >
            View
            <Badge variant="outline" className="border-current px-1.5 text-current">
              {queued}
            </Badge>
          </Button>
        )}
      </div>

      <QueuedReportsSheet
        open={isListOpen}
        onOpenChange={setListOpen}
        waiting={waiting}
        blocked={blocked}
        isSending={isSending}
      />
    </>
  );
}
