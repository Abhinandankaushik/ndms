'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { REVIEW_REASONS, type PendingReview, type ReviewReason } from '@/lib/api/types';
import { REVIEW_REASON_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { PageContainer, PageHeader } from '../common/PageHeader';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { formatCount } from '../lib/format';
import { useNow } from '../lib/useNow';
import { PENDING_REVIEWS_LIMIT, pendingReviewsQuery } from '../queries';
import { ResolveReviewDialog } from './ResolveReviewDialog';
import { ReviewCard } from './ReviewCard';

type ReasonFilter = ReviewReason | 'ALL';

export function ReviewsView() {
  const now = useNow();
  const { data, error, isPending, isFetching, refetch } = useQuery(pendingReviewsQuery());
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('ALL');
  const [resolving, setResolving] = useState<PendingReview | null>(null);

  const counts = useMemo(() => {
    const byReason = new Map<ReviewReason, number>();
    for (const review of data ?? []) byReason.set(review.reason, (byReason.get(review.reason) ?? 0) + 1);
    return byReason;
  }, [data]);
  const visible = useMemo(
    () => (data ?? []).filter((review) => reasonFilter === 'ALL' || review.reason === reasonFilter),
    [data, reasonFilter],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Reviews"
        description="Reports the automatic checks or other officials flagged. Nothing is rejected without a person deciding, and resolving a review can leave the incident unchanged."
        actions={
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {data && data.length > 0 && (
        <div role="group" aria-label="Filter by reason" className="flex flex-wrap gap-2">
          <FilterChip active={reasonFilter === 'ALL'} onClick={() => setReasonFilter('ALL')}>
            All · {formatCount(data.length)}
          </FilterChip>
          {REVIEW_REASONS.filter((reason) => counts.has(reason)).map((reason) => (
            <FilterChip key={reason} active={reasonFilter === reason} onClick={() => setReasonFilter(reason)}>
              {REVIEW_REASON_LABELS[reason]} · {formatCount(counts.get(reason) ?? 0)}
            </FilterChip>
          ))}
        </div>
      )}

      {isPending ? (
        <ListSkeleton rows={4} className="p-0" />
      ) : error ? (
        <ErrorNotice error={error} title="Reviews could not be loaded" onRetry={() => void refetch()} />
      ) : visible.length === 0 ? (
        <EmptyNotice icon={ClipboardCheck} title="No reports are waiting for review">
          Possible duplicates, reports without a location and anything officials flag will appear here.
        </EmptyNotice>
      ) : (
        <div className="grid gap-3">
          {visible.map((review) => (
            <ReviewCard key={review.id} review={review} now={now} onResolve={setResolving} />
          ))}
          {data.length >= PENDING_REVIEWS_LIMIT && (
            <p className="text-sm text-muted-foreground">
              Showing the oldest {formatCount(PENDING_REVIEWS_LIMIT)} pending reviews. Resolve some to see the rest.
            </p>
          )}
        </div>
      )}

      <ResolveReviewDialog review={resolving} onClose={() => setResolving(null)} />
    </PageContainer>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}
