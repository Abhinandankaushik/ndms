import {
  Activity,
  BuildingComplex,
  Flame,
  Mountain,
  Siren,
  Tornado,
  TriangleAlert,
  WavesHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type {
  AlertSeverity,
  DisasterType,
  IncidentStatus,
  MissionStatus,
  ReviewReason,
} from '@/lib/api/types';
import {
  ALERT_SEVERITY_LABELS,
  DISASTER_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  MISSION_STATUS_LABELS,
  REVIEW_REASON_LABELS,
} from '@/lib/labels';
import { cn } from '@/lib/utils';
import { priorityBand, type PriorityBand } from '../lib/bands';

// Status dots use the same fills as the map markers (components/map/marker-icons.ts), so the queue and the map
// read as one legend.
const INCIDENT_STATUS_STYLE: Record<IncidentStatus, { badge: string; dot: string }> = {
  REPORTED: { badge: 'border-red-200 bg-red-50 text-red-900', dot: 'bg-red-600' },
  VERIFIED: { badge: 'border-orange-200 bg-orange-50 text-orange-900', dot: 'bg-orange-500' },
  ASSIGNED: { badge: 'border-blue-200 bg-blue-50 text-blue-900', dot: 'bg-blue-600' },
  IN_PROGRESS: { badge: 'border-violet-200 bg-violet-50 text-violet-900', dot: 'bg-violet-600' },
  RESOLVED: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-600' },
  REJECTED_DUPLICATE: { badge: 'border-zinc-200 bg-zinc-100 text-zinc-700', dot: 'bg-zinc-500' },
  REJECTED_FAKE: { badge: 'border-zinc-200 bg-zinc-100 text-zinc-700', dot: 'bg-zinc-500' },
};

const MISSION_STATUS_STYLE: Record<MissionStatus, string> = {
  ASSIGNED: 'border-amber-200 bg-amber-50 text-amber-900',
  ACCEPTED: 'border-sky-200 bg-sky-50 text-sky-900',
  EN_ROUTE: 'border-blue-200 bg-blue-50 text-blue-900',
  ON_SITE: 'border-violet-200 bg-violet-50 text-violet-900',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  REJECTED: 'border-red-200 bg-red-50 text-red-900',
  CANCELLED: 'border-zinc-200 bg-zinc-100 text-zinc-700',
};

const ALERT_SEVERITY_STYLE: Record<AlertSeverity, string> = {
  MINOR: 'border-sky-200 bg-sky-50 text-sky-900',
  MODERATE: 'border-amber-300 bg-amber-50 text-amber-900',
  SEVERE: 'border-orange-300 bg-orange-100 text-orange-950',
  EXTREME: 'border-red-700 bg-red-600 text-white',
};

const PRIORITY_STYLE: Record<PriorityBand, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-200 text-orange-950',
  medium: 'bg-amber-100 text-amber-950',
  low: 'bg-muted text-foreground',
  unscored: 'border border-dashed text-muted-foreground',
};

const DISASTER_TYPE_ICONS: Record<DisasterType, LucideIcon> = {
  FLOOD: WavesHorizontal,
  EARTHQUAKE: Activity,
  FIRE: Flame,
  CYCLONE: Tornado,
  LANDSLIDE: Mountain,
  BUILDING_COLLAPSE: BuildingComplex,
  OTHER: TriangleAlert,
};

export function IncidentStatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  const style = INCIDENT_STATUS_STYLE[status];
  return (
    <Badge variant="outline" className={cn(style.badge, className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
      {INCIDENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function MissionStatusBadge({ status, className }: { status: MissionStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(MISSION_STATUS_STYLE[status], className)}>
      {MISSION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AlertSeverityBadge({ severity, className }: { severity: AlertSeverity; className?: string }) {
  return (
    <Badge variant="outline" className={cn(ALERT_SEVERITY_STYLE[severity], className)}>
      {ALERT_SEVERITY_LABELS[severity]}
    </Badge>
  );
}

export function ReviewReasonBadge({ reason, className }: { reason: ReviewReason; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-amber-300 bg-amber-50 text-amber-900', className)}>
      {REVIEW_REASON_LABELS[reason]}
    </Badge>
  );
}

export function SosBadge({ className }: { className?: string }) {
  return (
    <Badge variant="destructive" className={className}>
      <Siren aria-hidden />
      SOS
    </Badge>
  );
}

export function PriorityBadge({ score, className }: { score: number | null; className?: string }) {
  const label = score === null ? 'Not scored yet' : `Priority ${Math.round(score)} of 100`;
  return (
    <span
      title={label}
      className={cn(
        'inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-sm font-semibold tabular-nums',
        PRIORITY_STYLE[priorityBand(score)],
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden>{score === null ? '–' : Math.round(score)}</span>
    </span>
  );
}

export function DisasterTypeIcon({ type, className }: { type: DisasterType; className?: string }) {
  const Icon = DISASTER_TYPE_ICONS[type];
  return <Icon aria-hidden className={className} />;
}

export function DisasterTypeLabel({ type, className }: { type: DisasterType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <DisasterTypeIcon type={type} className="size-4 shrink-0 text-muted-foreground" />
      {DISASTER_TYPE_LABELS[type]}
    </span>
  );
}
