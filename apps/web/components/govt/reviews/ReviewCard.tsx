'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot, ExternalLink, MapPinOff, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PendingReview } from '@/lib/api/types';
import { useSessionUser } from '@/lib/auth/session';
import { DisasterTypeLabel, IncidentStatusBadge, ReviewReasonBadge, SosBadge } from '../common/badges';
import { formatAge, formatDateTime, formatDistance, formatMinutes, formatPeople, shortId } from '../lib/format';
import { incidentDetailQuery } from '../queries';
import { openIncident } from '../workspace-store';

export function ReviewCard({
  review,
  now,
  onResolve,
}: {
  review: PendingReview;
  now: number;
  onResolve: (review: PendingReview) => void;
}) {
  const currentUserId = useSessionUser()?.id ?? null;
  const note = noteOf(review.details);
  const flaggedBy =
    review.flaggedBy === null ? 'Automatic check' : review.flaggedBy === currentUserId ? 'Flagged by you' : 'Flagged by an official';

  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ReviewReasonBadge reason={review.reason} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {review.flaggedBy === null ? <Bot aria-hidden className="size-3.5" /> : <UserRound aria-hidden className="size-3.5" />}
            {flaggedBy} · {formatAge(review.createdAt, now)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openIncident(review.incidentId)}>
            <ExternalLink />
            Open incident
          </Button>
          <Button size="sm" onClick={() => onResolve(review)}>
            Resolve…
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <IncidentSummary
          heading="Flagged report"
          incidentId={review.incidentId}
          type={review.incident.type}
          status={review.incident.status}
          isSos={review.incident.isSos}
          reportedAt={review.incident.reportedAt}
          description={review.incident.description}
          hasLocation={review.incident.lat !== null}
        />
        {review.reason === 'POSSIBLE_DUPLICATE' && review.relatedIncidentId && (
          <RelatedIncident incidentId={review.relatedIncidentId} details={review.details} />
        )}
      </div>

      {review.reason === 'LOCATION_UNCERTAIN' && review.flaggedBy === null && (
        <p className="text-sm text-muted-foreground">
          Sent without a location. Call the reporter or set a pin from the incident drawer before dispatching.
        </p>
      )}
      {note && (
        <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap text-muted-foreground">{note}</blockquote>
      )}
    </article>
  );
}

function IncidentSummary({
  heading,
  incidentId,
  type,
  status,
  isSos,
  reportedAt,
  description,
  hasLocation,
  extra,
}: {
  heading: string;
  incidentId: string;
  type: PendingReview['incident']['type'];
  status: PendingReview['incident']['status'];
  isSos: boolean;
  reportedAt: string;
  description: string | null;
  hasLocation: boolean;
  extra?: string;
}) {
  return (
    <section className="grid content-start gap-1.5 rounded-lg bg-muted/40 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        {heading} · #{shortId(incidentId)}
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {isSos && <SosBadge />}
        <DisasterTypeLabel type={type} />
        <IncidentStatusBadge status={status} />
      </div>
      <p className="text-xs text-muted-foreground">
        Reported {formatDateTime(reportedAt)}
        {extra && ` · ${extra}`}
      </p>
      {!hasLocation && (
        <p className="inline-flex items-center gap-1 text-xs text-amber-800">
          <MapPinOff aria-hidden className="size-3" />
          No location
        </p>
      )}
      <p className="line-clamp-3 text-sm">
        {description ?? <span className="text-muted-foreground">{isSos ? 'One-tap SOS, no description.' : 'No description.'}</span>}
      </p>
    </section>
  );
}

function RelatedIncident({ incidentId, details }: { incidentId: string; details: Record<string, unknown> }) {
  const { data, isPending, error } = useQuery(incidentDetailQuery(incidentId));
  const proximity = proximityOf(details);

  if (isPending) return <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Loading the related report…</div>;
  if (error) {
    return <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">The related report #{shortId(incidentId)} could not be loaded.</div>;
  }
  return (
    <div className="grid gap-2">
      <IncidentSummary
        heading="Possible original"
        incidentId={data.id}
        type={data.type}
        status={data.status}
        isSos={data.isSos}
        reportedAt={data.reportedAt}
        description={data.description}
        hasLocation={data.lat !== null}
        extra={[formatPeople(data.peopleAffected), proximity].filter(Boolean).join(' · ')}
      />
      <Button variant="link" size="sm" className="h-auto justify-self-start p-0" onClick={() => openIncident(data.id)}>
        Open the possible original
      </Button>
    </div>
  );
}

// Worker flags carry { distanceM, minutesApart }; official flags carry { note }.
function proximityOf(details: Record<string, unknown>): string | null {
  const { distanceM, minutesApart } = details;
  if (typeof distanceM !== 'number' || typeof minutesApart !== 'number') return null;
  return `${formatDistance(distanceM)} and ${formatMinutes(minutesApart)} apart`;
}

function noteOf(details: Record<string, unknown>): string | null {
  return typeof details.note === 'string' && details.note.trim() !== '' ? details.note : null;
}
