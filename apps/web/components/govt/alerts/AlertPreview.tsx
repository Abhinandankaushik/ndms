import { Megaphone } from 'lucide-react';
import type { AlertSeverity, UserRole } from '@/lib/api/types';
import { ALERT_SEVERITY_LABELS, ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const SEVERITY_PREVIEW_STYLE: Record<AlertSeverity, string> = {
  MINOR: 'border-l-sky-600 bg-sky-50 text-sky-950',
  MODERATE: 'border-l-amber-500 bg-amber-50 text-amber-950',
  SEVERE: 'border-l-orange-600 bg-orange-50 text-orange-950',
  EXTREME: 'border-l-red-700 bg-red-600 text-white',
};

export function audienceLabel(roles: readonly UserRole[]): string {
  return roles.length === 0 ? 'Everyone' : roles.map((role) => ROLE_LABELS[role]).join(', ');
}

export function AlertPreview({
  severity,
  title,
  message,
  roles,
  areaLabel,
  expiryLabel,
  className,
}: {
  severity: AlertSeverity;
  title: string;
  message: string;
  roles: readonly UserRole[];
  areaLabel: string;
  expiryLabel: string;
  className?: string;
}) {
  return (
    <figure className={cn('grid gap-2', className)}>
      <figcaption className="text-xs font-medium text-muted-foreground">Preview</figcaption>
      <div className={cn('grid gap-1 rounded-lg border-l-4 p-3', SEVERITY_PREVIEW_STYLE[severity])}>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Megaphone aria-hidden className="size-3.5" />
          {ALERT_SEVERITY_LABELS[severity]} alert
        </p>
        <p className="font-semibold">{title.trim() || 'Alert title'}</p>
        <p className="text-sm whitespace-pre-wrap">{message.trim() || 'The message people will read.'}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Sent to</dt>
        <dd>{audienceLabel(roles)}</dd>
        <dt className="text-muted-foreground">Area</dt>
        <dd>{areaLabel}</dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{expiryLabel}</dd>
      </dl>
    </figure>
  );
}
