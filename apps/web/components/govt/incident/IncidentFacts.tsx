'use client';

import { CloudOff, MapPinOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { Incident } from '@/lib/api/types';
import { VulnerabilityFlags } from '../common/VulnerabilityFlags';
import { formatCoordinates, formatDateTime, formatMinutes, formatPeople, shortId } from '../lib/format';
import { openIncident } from '../workspace-store';

// Reports queued offline keep their device time; a gap this large means the report waited before reaching NDMS.
const OFFLINE_DELAY_NOTICE_MS = 5 * 60_000;

export function IncidentFacts({ incident }: { incident: Incident }) {
  const deliveryDelayMs = Date.parse(incident.createdAt) - Date.parse(incident.reportedAt);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <Fact label="Priority">
        {incident.priorityScore === null ? (
          <span className="text-muted-foreground">Not scored yet</span>
        ) : (
          <>
            {Math.round(incident.priorityScore)} / 100
            {incident.severityLevel !== null && (
              <span className="text-muted-foreground"> · severity {incident.severityLevel} of 5</span>
            )}
          </>
        )}
      </Fact>
      <Fact label="People affected">{formatPeople(incident.peopleAffected)}</Fact>
      <Fact label="Vulnerable people" wide>
        <VulnerabilityFlags incident={incident} emptyLabel="None reported" />
      </Fact>
      <Fact label="Location" wide>
        {incident.lat === null || incident.lon === null ? (
          <span className="inline-flex items-center gap-1.5 text-amber-800">
            <MapPinOff aria-hidden className="size-4" />
            No location shared. Set one before dispatching.
          </span>
        ) : (
          <>
            <span className="tabular-nums">{formatCoordinates(incident.lat, incident.lon)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {incident.locationSource === 'MANUAL_PIN' ? 'pin placed manually' : 'device GPS'}
              {incident.accuracyM !== null && ` ±${Math.round(incident.accuracyM)} m`}
            </span>
          </>
        )}
      </Fact>
      {incident.addressText && (
        <Fact label="Address" wide>
          {incident.addressText}
        </Fact>
      )}
      <Fact label="Description" wide>
        {incident.description ? (
          <span className="whitespace-pre-wrap">{incident.description}</span>
        ) : (
          <span className="text-muted-foreground">{incident.isSos ? 'One-tap SOS, no description.' : 'No description.'}</span>
        )}
      </Fact>
      <Fact label="Reported (device time)">{formatDateTime(incident.reportedAt)}</Fact>
      <Fact label="Received">
        {formatDateTime(incident.createdAt)}
        {deliveryDelayMs >= OFFLINE_DELAY_NOTICE_MS && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-800">
            <CloudOff aria-hidden className="size-3" />
            Sent {formatMinutes(deliveryDelayMs / 60_000)} after it was reported
          </span>
        )}
      </Fact>
      {incident.duplicateOf && (
        <Fact label="Duplicate of" wide>
          <Button variant="link" className="h-auto p-0" onClick={() => incident.duplicateOf && openIncident(incident.duplicateOf)}>
            Incident #{shortId(incident.duplicateOf)}
          </Button>
        </Fact>
      )}
    </dl>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 grid gap-0.5' : 'grid gap-0.5'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
