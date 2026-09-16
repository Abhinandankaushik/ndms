'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox, LoaderCircle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { IncidentQueueQuery } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { formatCount } from '../lib/format';
import { useNow } from '../lib/useNow';
import { incidentQueueQuery } from '../queries';
import { NO_REVIEW_REASONS, usePendingReviewReasons } from '../reviews/usePendingReviewFlags';
import { useIncidentFilters } from './incident-filters';
import { QueueRow } from './QueueRow';

const PAGE_SIZE = 50;
// The API's ceiling for one queue request.
const MAX_ROWS = 200;

export function IncidentQueuePanel({ className }: { className?: string }) {
  const headingId = useId();
  const filters = useIncidentFilters();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const now = useNow();
  const reviewReasons = usePendingReviewReasons();

  const query = useMemo<IncidentQueueQuery>(
    () => ({ status: filters.statuses, type: filters.types, sosOnly: filters.sosOnly, limit }),
    [filters, limit],
  );
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useQuery({
    ...incidentQueueQuery(query),
    placeholderData: keepPreviousData,
  });

  const canShowMore = data !== undefined && data.length >= limit && limit < MAX_ROWS;

  return (
    <section aria-labelledby={headingId} className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card', className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id={headingId} className="font-semibold">
            Priority queue
          </h2>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${formatCount(data.length)} ${data.length === 1 ? 'incident' : 'incidents'} · highest priority first`
              : 'Highest priority first, unscored reports after scored ones'}
          </p>
        </div>
        {isFetching && !isPending && (
          <LoaderCircle role="status" aria-label="Updating the queue" className="size-4 animate-spin text-muted-foreground" />
        )}
      </header>

      {/* relative: sr-only labels inside the rows are absolutely positioned, and without a
          positioned scroll container they escape the clip and stretch the whole document. */}
      <div className={cn('relative min-h-0 flex-1 overflow-y-auto transition-opacity', isPlaceholderData && 'opacity-60')}>
        {isPending ? (
          <ListSkeleton rows={6} />
        ) : error && !data ? (
          <ErrorNotice error={error} title="The queue could not be loaded" onRetry={() => void refetch()} className="m-3 w-auto" />
        ) : data && data.length === 0 ? (
          <EmptyNotice icon={Inbox} title="No incidents match these filters">
            New reports appear here the moment they arrive.
          </EmptyNotice>
        ) : (
          <ol aria-label="Incidents by priority" className="divide-y">
            {data?.map((incident) => (
              <QueueRow
                key={incident.id}
                incident={incident}
                now={now}
                reviewReasons={reviewReasons.get(incident.id) ?? NO_REVIEW_REASONS}
              />
            ))}
          </ol>
        )}
        {canShowMore && (
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={isFetching}
              onClick={() => setLimit((current) => Math.min(MAX_ROWS, current + PAGE_SIZE))}
            >
              Show {PAGE_SIZE} more
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
