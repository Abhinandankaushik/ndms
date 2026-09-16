'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck,
  HandHelping,
  House,
  LifeBuoy,
  Siren,
  Timer,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardSummary } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { ErrorNotice } from '../common/QueryStates';
import { UtilisationBar } from '../common/UtilisationBar';
import { utilisationBand } from '../lib/bands';
import { formatClockTime, formatCompactCount, formatCount, formatMinutes, formatPercent } from '../lib/format';
import { summaryQuery } from '../queries';

type Tone = 'neutral' | 'warning' | 'critical';

const TONE_STYLE: Record<Tone, { tile: string; icon: string }> = {
  neutral: { tile: 'bg-card', icon: 'text-muted-foreground' },
  warning: { tile: 'border-amber-300 bg-amber-50', icon: 'text-amber-700' },
  critical: { tile: 'border-red-300 bg-red-50', icon: 'text-red-700' },
};

const TILE_COUNT = 8;

const gridClassName = 'grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8';

export function KpiStrip({ className }: { className?: string }) {
  const { data, error, isPending, refetch } = useQuery(summaryQuery());

  if (isPending) {
    return (
      <div role="status" aria-label="Loading district summary" className={cn(gridClassName, className)}>
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-[74px] rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorNotice error={error} title="District summary unavailable" onRetry={() => void refetch()} className={className} />;
  }
  return <KpiTiles summary={data} className={className} />;
}

function KpiTiles({ summary, className }: { summary: DashboardSummary; className?: string }) {
  const shelterBand = utilisationBand(summary.shelterUtilisation);

  return (
    <section
      aria-label={`District summary, updated ${formatClockTime(summary.generatedAt)}`}
      className={cn(gridClassName, className)}
    >
      <StatTile
        icon={Siren}
        label="Active incidents"
        value={formatCompactCount(summary.activeIncidents)}
        detail={`${formatCount(summary.openSos)} open SOS`}
        tone={summary.openSos > 0 ? 'critical' : 'neutral'}
      />
      <StatTile
        icon={Users}
        label="People affected"
        value={formatCompactCount(summary.peopleAffected)}
        detail="in open incidents"
      />
      <StatTile
        icon={ClipboardCheck}
        label="Pending reviews"
        value={formatCount(summary.pendingReviews)}
        detail={summary.pendingReviews > 0 ? 'Needs a decision' : 'Queue clear'}
        tone={summary.pendingReviews > 0 ? 'warning' : 'neutral'}
        href="/govt/reviews"
      />
      <StatTile
        icon={Truck}
        label="Teams available"
        value={`${formatCount(summary.teamsAvailable)} / ${formatCount(summary.teamsTotal)}`}
        detail={`${formatCount(summary.teamsOnMission)} on missions`}
        tone={summary.teamsTotal > 0 && summary.teamsAvailable === 0 ? 'warning' : 'neutral'}
        href="/govt/missions"
      />
      <StatTile
        icon={House}
        label="Shelter load"
        value={formatPercent(summary.shelterUtilisation)}
        tone={shelterBand === 'critical' ? 'critical' : shelterBand === 'warning' ? 'warning' : 'neutral'}
        href="/govt/resources"
        detail={
          <UtilisationBar
            occupancy={summary.shelterOccupancy}
            capacity={summary.shelterCapacity}
            utilisation={summary.shelterUtilisation}
            showLabel={false}
            className="mt-1"
          />
        }
      />
      <StatTile icon={LifeBuoy} label="Rescued today" value={formatCompactCount(summary.peopleRescuedToday)} detail="people" />
      <StatTile
        icon={Timer}
        label="Avg response"
        value={summary.avgResponseMinutes24h === null ? '–' : formatMinutes(summary.avgResponseMinutes24h)}
        detail="report to team on site, 24 h"
      />
      <StatTile
        icon={HandHelping}
        label="Volunteers"
        value={formatCount(summary.verifiedVolunteers)}
        detail="verified"
        href="/govt/volunteers"
      />
    </section>
  );
}

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: ReactNode;
  tone?: Tone;
  href?: string;
}

function StatTile({ icon: Icon, label, value, detail, tone = 'neutral', href }: StatTileProps) {
  const style = TONE_STYLE[tone];
  const content = (
    <>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon aria-hidden className={cn('size-4 shrink-0', style.icon)} />
      </span>
      <span className="truncate text-xl font-semibold tracking-tight">{value}</span>
      {typeof detail === 'string' ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : detail}
    </>
  );
  const tileClassName = cn('grid min-w-0 content-start gap-0.5 rounded-lg border px-3 py-2', style.tile);

  if (!href) return <div className={tileClassName}>{content}</div>;
  return (
    <Link
      href={href}
      className={cn(
        tileClassName,
        'outline-none transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      {content}
    </Link>
  );
}
