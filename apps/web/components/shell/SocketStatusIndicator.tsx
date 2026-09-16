'use client';

import { useSocketStatus, type SocketStatus } from '@/lib/realtime/socket';
import { cn } from '@/lib/utils';

const STATUS_PRESENTATION: Record<SocketStatus, { label: string; dotClassName: string }> = {
  connected: { label: 'Live updates connected', dotClassName: 'bg-emerald-500' },
  connecting: { label: 'Connecting to live updates', dotClassName: 'bg-amber-500 animate-pulse' },
  disconnected: { label: 'Live updates offline', dotClassName: 'bg-destructive' },
  idle: { label: 'Live updates not started', dotClassName: 'bg-muted-foreground/40' },
};

export function SocketStatusIndicator({ className }: { className?: string }) {
  const status = useSocketStatus();
  const { label, dotClassName } = STATUS_PRESENTATION[status];

  return (
    <span role="status" title={label} className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <span aria-hidden className={cn('size-2.5 rounded-full', dotClassName)} />
      <span className="sr-only">{label}</span>
      <span aria-hidden className="hidden md:inline">
        {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
      </span>
    </span>
  );
}
