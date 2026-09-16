import { cn } from '@/lib/utils';
import { utilisationBand, utilisationLabel, type UtilisationBand } from '../lib/bands';
import { formatCount, formatPercent } from '../lib/format';

// The unfilled track is a light step of the fill's own hue, so the band still reads on a nearly empty bar.
const BAND_STYLE: Record<UtilisationBand, { track: string; fill: string }> = {
  good: { track: 'bg-emerald-100', fill: 'bg-emerald-600' },
  warning: { track: 'bg-amber-100', fill: 'bg-amber-500' },
  critical: { track: 'bg-red-100', fill: 'bg-red-600' },
};

export interface UtilisationBarProps {
  occupancy: number;
  capacity: number;
  utilisation: number;
  showLabel?: boolean;
  className?: string;
}

export function UtilisationBar({ occupancy, capacity, utilisation, showLabel = true, className }: UtilisationBarProps) {
  const style = BAND_STYLE[utilisationBand(utilisation)];
  const percent = Math.min(100, Math.max(0, Math.round(utilisation * 100)));
  const description = `${formatCount(occupancy)} of ${formatCount(capacity)} places taken`;

  return (
    <div className={cn('grid gap-1', className)}>
      <div
        role="meter"
        aria-label="Utilisation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatPercent(utilisation)}, ${description}`}
        className={cn('h-2 w-full overflow-hidden rounded-full', style.track)}
      >
        <div className={cn('h-full rounded-full transition-[width]', style.fill)} style={{ width: `${percent}%` }} />
      </div>
      {showLabel && (
        <p className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatPercent(utilisation)} · {utilisationLabel(utilisation)}
          </span>
          <span className="tabular-nums">{description}</span>
        </p>
      )}
    </div>
  );
}
