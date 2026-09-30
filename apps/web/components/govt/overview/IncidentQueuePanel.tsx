'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox, LoaderCircle, SearchX } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { IncidentQueueQuery, QueueSort, SearchMatch } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { formatCount } from '../lib/format';
import { useNow } from '../lib/useNow';
import { incidentQueueQuery, incidentSearchQuery } from '../queries';
import { NO_REVIEW_REASONS, usePendingReviewReasons } from '../reviews/usePendingReviewFlags';
import { useIncidentFilters } from './incident-filters';
import { isSearching, useIncidentSearch, windowStart } from './incident-search';
import { QueueRow } from './QueueRow';

const PAGE_SIZE = 50;
// The API's ceiling for one queue request.
const MAX_ROWS = 200;

const SORT_SUMMARY: Record<QueueSort, string> = {
  priority: 'highest priority first',
  newest: 'newest first',
};

// Naming the branch explains an otherwise surprising result set, e.g. why a number returned
// every report from one caller rather than the one incident whose id starts with those digits.
const MATCH_LABELS: Record<SearchMatch, string> = {
  id: 'matched an incident id',
  id_prefix: 'matched the start of an incident id',
  phone: 'matched the reporter’s phone',
  text: 'matched place and description',
};

export function IncidentQueuePanel({ className }: { className?: string }) {
  const headingId = useId();
  const filters = useIncidentFilters();
  const search = useIncidentSearch();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const now = useNow();
  const reviewReasons = usePendingReviewReasons();

  const term = search.term.trim();
  const searching = isSearching(term);
  const from = windowStart(search.window);

  const query = useMemo<IncidentQueueQuery>(
    () => ({
      status: filters.statuses,
      type: filters.types,
      sosOnly: filters.sosOnly,
      sort: search.sort,
      from,
      limit,
    }),
    [filters, search.sort, from, limit],
  );

  const queue = useQuery({ ...incidentQueueQuery(query), placeholderData: keepPreviousData, enabled: !searching });
  const results = useQuery({
    ...incidentSearchQuery({ q: term, from, limit }),
    placeholderData: keepPreviousData,
    enabled: searching,
  });

  const active = searching ? results : queue;
  const data = searching ? results.data?.incidents : queue.data;
  const { error, isPending, isFetching, isPlaceholderData, refetch } = active;

  const canShowMore = data !== undefined && data.length >= limit && limit < MAX_ROWS;

  return (
    <section aria-labelledby={headingId} className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card', className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id={headingId} className="font-semibold">
            {searching ? 'Search results' : 'Priority queue'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {searching
              ? data
                ? `${formatCount(data.length)} ${data.length === 1 ? 'match' : 'matches'} for “${term}”, any status · ${
                    MATCH_LABELS[results.data?.match ?? 'text']
                  }`
                : `Searching for “${term}”`
              : data
                ? `${formatCount(data.length)} ${data.length === 1 ? 'incident' : 'incidents'} · ${SORT_SUMMARY[search.sort]}`
                : SORT_SUMMARY[search.sort]}
          </p>
        </div>
        {isFetching && !isPending && (
          <LoaderCircle
            role="status"
            aria-label={searching ? 'Searching' : 'Updating the queue'}
            className="size-4 animate-spin text-muted-foreground"
          />
        )}
      </header>

      {/* relative: sr-only labels inside the rows are absolutely positioned, and without a
          positioned scroll container they escape the clip and stretch the whole document. */}
      <div className={cn('relative min-h-0 flex-1 overflow-y-auto transition-opacity', isPlaceholderData && 'opacity-60')}>
        {isPending ? (
          <ListSkeleton rows={6} />
        ) : error && !data ? (
          <ErrorNotice
            error={error}
            title={searching ? 'The search could not be run' : 'The queue could not be loaded'}
            onRetry={() => void refetch()}
            className="m-3 w-auto"
          />
        ) : data && data.length === 0 ? (
          searching ? (
            <EmptyNotice icon={SearchX} title={`Nothing matches “${term}”`}>
              Try a village name, a word from the description, an incident id, or the reporter’s phone number.
            </EmptyNotice>
          ) : (
            <EmptyNotice icon={Inbox} title="No incidents match these filters">
              New reports appear here the moment they arrive.
            </EmptyNotice>
          )
        ) : (
          <ol aria-label={searching ? 'Search results' : `Incidents, ${SORT_SUMMARY[search.sort]}`} className="divide-y">
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
