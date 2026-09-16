'use client';

import { CircleAlert, LoaderCircle, LocateFixed, LocateOff, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { retryDevicePosition, useDevicePosition } from './device-position';
import { formatAgo } from './format';
import { describeAccuracy, GPS_PROBLEMS, isStaleFix } from './gps-status';
import { resumeLiveLocation, useLiveLocation } from './live-location-sharing';
import { PING_MIN_MOVE_M } from './ping-throttle';
import { useNow } from './useNow';

type Tone = 'ok' | 'waiting' | 'problem';

const TONE_STYLE: Record<Tone, string> = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-950',
  waiting: 'border-amber-500 bg-amber-50 text-amber-950',
  problem: 'border-red-700 bg-red-50 text-red-950',
};

const TONE_ICON: Record<Tone, ReactNode> = {
  ok: <LocateFixed aria-hidden className="size-5 shrink-0" />,
  waiting: <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin" />,
  problem: <LocateOff aria-hidden className="size-5 shrink-0" />,
};

/** Live location sharing status while a mission is accepted, en route or on site; renders nothing otherwise. */
export function LiveLocationBar({ className }: { className?: string }) {
  const sharing = useLiveLocation((state) => state.sharing);
  return sharing ? <SharingStatus className={className} /> : null;
}

function SharingStatus({ className }: { className?: string }) {
  const { lastSentAtMs, stationary, failure } = useLiveLocation();
  const { status, fix } = useDevicePosition();
  const nowMs = useNow(1_000);
  const gpsProblem = GPS_PROBLEMS[status];

  if (gpsProblem) {
    return (
      <StatusPanel tone="problem" title={gpsProblem.title} className={className}>
        <p className="text-sm font-medium">Your position is not reaching the control room. {gpsProblem.message}</p>
        {gpsProblem.canRetry && <PanelButton onClick={retryDevicePosition}>Try again</PanelButton>}
      </StatusPanel>
    );
  }

  const staleFix = fix !== null && isStaleFix(fix, nowMs);
  const { tone, title } = headline({
    hasFix: fix !== null,
    gpsLost: status === 'unavailable' || staleFix,
    failing: failure !== null,
    paused: failure?.paused === true,
  });

  return (
    <StatusPanel tone={tone} title={title} className={className}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">Last sent</dt>
          <dd className="text-base font-bold">{lastSentAtMs === null ? 'Not yet' : formatAgo(lastSentAtMs, nowMs)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">GPS accuracy</dt>
          <dd className="text-base font-bold">{fix ? describeAccuracy(fix.accuracyM) : 'Waiting'}</dd>
        </div>
      </dl>
      {staleFix && fix && <p className="text-sm font-medium">Last GPS fix {formatAgo(fix.recordedAtMs, nowMs)}.</p>}
      {failure && (
        <p className="flex items-start gap-1.5 text-sm font-medium">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {failure.message}
        </p>
      )}
      {!failure && stationary && (
        <p className="text-sm font-medium">Standing still: the next update goes out after you move {PING_MIN_MOVE_M} m.</p>
      )}
      {failure?.paused && <PanelButton onClick={resumeLiveLocation}>Try again</PanelButton>}
      <p className="text-xs font-medium">Keep NDMS open on screen. Phones pause location for apps in the background.</p>
    </StatusPanel>
  );
}

function headline(state: { hasFix: boolean; gpsLost: boolean; failing: boolean; paused: boolean }): {
  tone: Tone;
  title: string;
} {
  if (state.paused) return { tone: 'problem', title: 'Location sharing stopped' };
  if (!state.hasFix) return { tone: 'waiting', title: 'Finding your GPS position…' };
  if (state.gpsLost) return { tone: 'waiting', title: 'GPS signal weak. Move into the open.' };
  if (state.failing) return { tone: 'problem', title: 'Location not reaching NDMS' };
  return { tone: 'ok', title: 'Sharing live location' };
}

function StatusPanel({
  tone,
  title,
  className,
  children,
}: {
  tone: Tone;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label="Live location" className={cn('grid gap-2 rounded-xl border-2 p-3', TONE_STYLE[tone], className)}>
      <div className="flex items-center gap-2">
        {TONE_ICON[tone]}
        <p role="status" className="text-base font-bold">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

function PanelButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" className="h-12 w-full border-2 border-current bg-white text-base font-bold" onClick={onClick}>
      <RotateCw aria-hidden className="size-5" />
      {children}
    </Button>
  );
}
