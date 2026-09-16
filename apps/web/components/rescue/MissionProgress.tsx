'use client';

import { Ban, Check, CircleSlash } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Mission, MissionStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { formatDayAndTime } from './format';
import { PROGRESS_STEPS } from './mission-flow';

// Short enough for five columns on a 360 px wide phone.
const STEP_LABELS: Partial<Record<MissionStatus, string>> = {
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  EN_ROUTE: 'En route',
  ON_SITE: 'On site',
  COMPLETED: 'Done',
};

export function MissionProgress({ status }: { status: MissionStatus }) {
  const currentIndex = PROGRESS_STEPS.indexOf(status);
  if (currentIndex === -1) return null;
  const finished = status === 'COMPLETED';

  return (
    <ol aria-label="Mission progress" className="grid grid-cols-5 gap-1">
      {PROGRESS_STEPS.map((step, index) => {
        const done = finished || index < currentIndex;
        const current = !finished && index === currentIndex;
        return (
          <li key={step} aria-current={current ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
            <span
              aria-hidden
              className={cn(
                'flex size-9 items-center justify-center rounded-full border-2 text-sm font-black',
                done && 'border-slate-900 bg-slate-900 text-white',
                current && 'border-slate-900 bg-amber-400 text-slate-950 ring-2 ring-slate-900 ring-offset-2',
                !done && !current && 'border-slate-400 bg-white text-slate-600',
              )}
            >
              {done ? <Check className="size-5" /> : index + 1}
            </span>
            <span className={cn('text-xs leading-tight', current ? 'font-black' : 'font-semibold')}>
              {STEP_LABELS[step]}
              <span className="sr-only">{done ? ', done' : current ? ', current step' : ', not yet'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** What ended a closed mission: the team's refusal, the control room's cancellation or the rescue outcome. */
export function MissionClosure({ mission }: { mission: Mission }) {
  switch (mission.status) {
    case 'REJECTED':
      return (
        <ClosurePanel icon={<Ban aria-hidden className="size-6 shrink-0" />} title="Your team turned down this mission">
          {mission.rejectionReason && <Line label="Reason">{mission.rejectionReason}</Line>}
          <Line label="Closed">{formatDayAndTime(mission.updatedAt)}</Line>
        </ClosurePanel>
      );
    case 'CANCELLED':
      return (
        <ClosurePanel icon={<CircleSlash aria-hidden className="size-6 shrink-0" />} title="The control room cancelled this mission">
          {mission.outcomeNotes && <Line label="Note">{mission.outcomeNotes}</Line>}
          <Line label="Cancelled">{formatDayAndTime(mission.updatedAt)}</Line>
        </ClosurePanel>
      );
    case 'COMPLETED':
      return (
        <ClosurePanel icon={<Check aria-hidden className="size-6 shrink-0" />} title="Rescue completed" tone="success">
          <Line label="People rescued">{mission.peopleRescued ?? 'Not recorded'}</Line>
          <Line label="People injured">{mission.injuredCount ?? 'Not recorded'}</Line>
          <Line label="Hospital needed">
            {mission.hospitalRequired === null ? 'Not recorded' : mission.hospitalRequired ? 'Yes' : 'No'}
          </Line>
          {mission.outcomeNotes && <Line label="Notes">{mission.outcomeNotes}</Line>}
          {mission.completedAt && <Line label="Completed">{formatDayAndTime(mission.completedAt)}</Line>}
        </ClosurePanel>
      );
    default:
      return null;
  }
}

function ClosurePanel({
  icon,
  title,
  tone = 'neutral',
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: 'neutral' | 'success';
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'grid gap-3 rounded-xl border-2 p-4',
        tone === 'success' ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-slate-400 bg-slate-100 text-slate-950',
      )}
    >
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h2>
      <dl className="grid gap-2 text-base">{children}</dl>
    </section>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
      <dt className="text-sm leading-6 font-semibold">{label}</dt>
      <dd className="font-bold break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}
