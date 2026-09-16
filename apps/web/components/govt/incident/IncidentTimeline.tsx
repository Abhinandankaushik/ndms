'use client';

import { ArrowRight } from 'lucide-react';
import type { IncidentTimelineEntry } from '@/lib/api/types';
import { useSessionUser } from '@/lib/auth/session';
import { IncidentStatusBadge } from '../common/badges';
import { formatDateTime, shortId } from '../lib/format';

export function IncidentTimeline({ entries }: { entries: readonly IncidentTimelineEntry[] }) {
  const currentUserId = useSessionUser()?.id ?? null;

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No status changes yet.</p>;
  }

  return (
    <ol className="grid gap-3 border-l pl-4">
      {entries.map((entry, index) => (
        <li key={`${entry.changedAt}:${index}`} className="relative grid gap-1">
          <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.fromStatus && (
              <>
                <IncidentStatusBadge status={entry.fromStatus} />
                <ArrowRight aria-label="to" className="size-3.5 text-muted-foreground" />
              </>
            )}
            <IncidentStatusBadge status={entry.toStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt)}</time> ·{' '}
            {actorLabel(entry.changedBy, currentUserId)}
          </p>
          {entry.note && <p className="text-sm whitespace-pre-wrap">{entry.note}</p>}
        </li>
      ))}
    </ol>
  );
}

// The API returns only the actor's id; names are not exposed for other accounts.
function actorLabel(changedBy: string | null, currentUserId: string | null): string {
  if (changedBy === null) return 'system';
  if (changedBy === currentUserId) return 'you';
  return `user #${shortId(changedBy)}`;
}
