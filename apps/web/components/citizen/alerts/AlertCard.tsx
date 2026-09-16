import { formatRelativeTime, formatTimestamp } from '@/components/citizen/common/format';
import { ALERT_SEVERITY_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { FeedAlert } from './geofence';
import { SEVERITY_STYLES } from './presentation';

export function AlertCard({ alert, now, isNew }: { alert: FeedAlert; now: number; isNew: boolean }) {
  const style = SEVERITY_STYLES[alert.severity];
  const Icon = style.icon;

  return (
    <article className={cn('grid gap-2 rounded-xl border-2 p-4 shadow-sm', style.card)} aria-label={`${ALERT_SEVERITY_LABELS[alert.severity]} alert: ${alert.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden className="size-6 shrink-0" />
        <span className={cn('rounded-md border px-2 py-0.5 text-sm font-bold uppercase', style.badge)}>
          {ALERT_SEVERITY_LABELS[alert.severity]}
        </span>
        {isNew && <span className="rounded-md border border-current px-2 py-0.5 text-sm font-bold">New</span>}
      </div>
      <h2 className="text-xl leading-snug font-bold break-words">{alert.title}</h2>
      <p className="text-base leading-relaxed break-words whitespace-pre-line">{alert.message}</p>
      <p className="text-sm font-medium opacity-90">
        {alert.geofence ? 'For the area you are in' : 'For the whole district'} · issued{' '}
        {formatRelativeTime(alert.issuedAt, now)}
        {alert.expiresAt && ` · until ${formatTimestamp(alert.expiresAt, now)}`}
      </p>
    </article>
  );
}
