'use client';

import { useId, type ReactNode } from 'react';
import type { Incident } from '@/lib/api/types';
import { INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { formatAgo, formatDayAndTime, formatPeople } from './format';

export function IncidentFacts({ incident, nowMs }: { incident: Incident; nowMs: number }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid gap-3 rounded-xl border-2 border-slate-300 p-4">
      <h2 id={headingId} className="text-lg font-bold">
        What was reported
      </h2>
      {incident.description && <p className="text-base font-medium whitespace-pre-line">{incident.description}</p>}
      <dl className="grid gap-2 text-base">
        <Fact label="People affected">{formatPeople(incident.peopleAffected)}</Fact>
        {incident.addressText && <Fact label="Address or landmark">{incident.addressText}</Fact>}
        <Fact label="Reported">
          {formatAgo(Date.parse(incident.reportedAt), nowMs)} ({formatDayAndTime(incident.reportedAt)})
        </Fact>
        <Fact label="Location">{describeLocation(incident)}</Fact>
        <Fact label="Incident status">{INCIDENT_STATUS_LABELS[incident.status]}</Fact>
        {incident.priorityScore !== null && (
          <Fact label="Priority">
            {Math.round(incident.priorityScore)} of 100
            {incident.severityLevel !== null && `, severity ${incident.severityLevel} of 5`}
          </Fact>
        )}
      </dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
      <dt className="text-sm leading-6 font-semibold text-slate-700">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function describeLocation(incident: Incident): string {
  switch (incident.locationSource) {
    case 'GPS':
      return incident.accuracyM === null ? 'Phone GPS' : `Phone GPS, within ±${Math.round(incident.accuracyM)} m`;
    case 'MANUAL_PIN':
      return 'Pin the reporter placed on a map';
    case 'NONE':
      return 'Not shared';
  }
}
