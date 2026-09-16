import { cn } from '@/lib/utils';
import {
  CAPACITY_ALERT_PERCENT,
  CAPACITY_WARNING_PERCENT,
  capacityLevel,
  utilisationPercent,
  type CapacityLevel,
  type Headcount,
} from './capacity';

const LEVEL_FILL: Record<CapacityLevel, string> = {
  normal: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
};

export function CapacityBar({ headcount, className }: { headcount: Headcount; className?: string }) {
  const level = capacityLevel(headcount);
  const percent = utilisationPercent(headcount);
  const fillPercent = headcount.capacity > 0 ? Math.min(100, (headcount.occupancy / headcount.capacity) * 100) : 0;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div
        role="meter"
        aria-label="Capacity used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% of capacity used`}
        className="relative h-4 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width,background-color] duration-300', LEVEL_FILL[level])}
          style={{ width: `${fillPercent}%` }}
        />
        <ThresholdTick percent={CAPACITY_WARNING_PERCENT} />
        <ThresholdTick percent={CAPACITY_ALERT_PERCENT} />
      </div>
      <div aria-hidden className="relative h-4 text-[0.6875rem] text-muted-foreground">
        <span className="absolute -translate-x-1/2" style={{ left: `${CAPACITY_WARNING_PERCENT}%` }}>
          {CAPACITY_WARNING_PERCENT}%
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${CAPACITY_ALERT_PERCENT}%` }}>
          {CAPACITY_ALERT_PERCENT}%
        </span>
      </div>
    </div>
  );
}

function ThresholdTick({ percent }: { percent: number }) {
  return <span aria-hidden className="absolute inset-y-0 w-0.5 bg-background/80" style={{ left: `${percent}%` }} />;
}
