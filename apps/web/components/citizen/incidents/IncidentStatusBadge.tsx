import { Badge } from '@/components/ui/badge';
import type { IncidentStatus } from '@/lib/api/types';
import { INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { STATUS_BADGE_CLASSES } from './presentation';

export function IncidentStatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('px-2.5 py-1 text-sm font-semibold', STATUS_BADGE_CLASSES[status], className)}>
      {INCIDENT_STATUS_LABELS[status]}
    </Badge>
  );
}
