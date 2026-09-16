import { formatRelativeTime, formatTimestamp } from '@/components/citizen/common/format';
import { Panel } from '@/components/citizen/common/page';
import type { IncidentTimelineEntry } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { timelineLabel } from './presentation';

export function StatusTimeline({ timeline, now }: { timeline: readonly IncidentTimelineEntry[]; now: number }) {
  const newestFirst = [...timeline].reverse();

  return (
    <Panel title="Timeline">
      <ol className="ml-1.5 grid gap-5 border-l-2 border-foreground/20 pl-5">
        {newestFirst.map((entry, index) => (
          <li key={`${entry.changedAt}-${entry.toStatus}-${index}`} className="relative">
            <span
              aria-hidden
              className={cn(
                'absolute top-1.5 -left-[27px] size-3 rounded-full ring-4 ring-card',
                index === 0 ? 'bg-foreground' : 'bg-foreground/35',
              )}
            />
            <p className={cn('text-base', index === 0 ? 'font-bold' : 'font-medium')}>{timelineLabel(entry)}</p>
            <p className="text-sm text-foreground/75">
              <time dateTime={entry.changedAt}>{formatTimestamp(entry.changedAt, now)}</time>
              {' · '}
              {formatRelativeTime(entry.changedAt, now)}
            </p>
            {entry.note && <p className="mt-1 text-sm break-words whitespace-pre-line">Note: {entry.note}</p>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
