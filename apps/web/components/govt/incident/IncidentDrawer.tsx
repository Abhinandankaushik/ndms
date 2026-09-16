'use client';

import { useQuery } from '@tanstack/react-query';
import { Flag, LocateFixed, MapPinPen, Truck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { IncidentDetail, IncidentStatus } from '@/lib/api/types';
import { REVIEW_REASON_LABELS } from '@/lib/labels';
import { DisasterTypeLabel, IncidentStatusBadge, SosBadge } from '../common/badges';
import { ErrorNotice } from '../common/QueryStates';
import { hasErrorCode } from '../lib/errors';
import { formatAge, formatDateTime, shortId } from '../lib/format';
import { locationOf } from '../lib/geo';
import { useNow } from '../lib/useNow';
import { STATUS_ACTION_LABELS, isOpenIncident, isRejection, officialStatusTargets } from '../lib/workflow';
import { incidentDetailQuery } from '../queries';
import { usePendingReviewsByIncident } from '../reviews/usePendingReviewFlags';
import { closeIncident, focusMapOn, openDispatch, useGovtWorkspace } from '../workspace-store';
import { FlagIncidentDialog } from './FlagIncidentDialog';
import { IncidentFacts } from './IncidentFacts';
import { IncidentLocationMap } from './IncidentLocationMap';
import { IncidentMissions } from './IncidentMissions';
import { IncidentPhotos } from './IncidentPhotos';
import { IncidentTimeline } from './IncidentTimeline';
import { SetLocationDialog } from './SetLocationDialog';
import { StatusChangeDialog } from './StatusChangeDialog';

const OVERVIEW_PATH = '/govt';

export function IncidentDrawer() {
  const incidentId = useGovtWorkspace((state) => state.drawerIncidentId);
  // The last incident stays rendered while the sheet slides closed.
  const [shownId, setShownId] = useState(incidentId);
  if (incidentId && incidentId !== shownId) setShownId(incidentId);

  // Non-modal and not dismissed by outside clicks: the map stays usable beside the drawer, and picking another
  // marker swaps the incident shown instead of closing the panel.
  return (
    <Sheet modal={false} open={incidentId !== null} onOpenChange={(open) => !open && closeIncident()}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-l shadow-2xl sm:max-w-xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        {shownId ? (
          <IncidentDrawerBody key={shownId} incidentId={shownId} />
        ) : (
          <SheetHeader>
            <SheetTitle>Incident</SheetTitle>
            <SheetDescription>No incident selected.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function IncidentDrawerBody({ incidentId }: { incidentId: string }) {
  const { data: incident, error, isPending, refetch } = useQuery(incidentDetailQuery(incidentId));

  if (isPending) {
    return (
      <>
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Loading incident…</SheetTitle>
          <SheetDescription>#{shortId(incidentId)}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 p-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Incident unavailable</SheetTitle>
          <SheetDescription>#{shortId(incidentId)}</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <ErrorNotice
            error={error}
            title={hasErrorCode(error, 'INCIDENT_NOT_FOUND') ? 'Not found in your district' : 'Could not load the incident'}
            onRetry={() => void refetch()}
          />
        </div>
      </>
    );
  }

  return <IncidentDetails incident={incident} />;
}

function IncidentDetails({ incident }: { incident: IncidentDetail }) {
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const pendingReviews = usePendingReviewsByIncident().get(incident.id) ?? [];
  const [statusTarget, setStatusTarget] = useState<IncidentStatus | null>(null);
  const [isFlagging, setIsFlagging] = useState(false);
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const location = locationOf(incident);
  const suggestedDuplicateOf = pendingReviews.find((review) => review.relatedIncidentId)?.relatedIncidentId ?? null;

  const showOnMap = () => {
    if (!location) return;
    focusMapOn(location);
    if (pathname !== OVERVIEW_PATH) router.push(OVERVIEW_PATH);
  };

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
          {incident.isSos && <SosBadge />}
          <DisasterTypeLabel type={incident.type} />
          <IncidentStatusBadge status={incident.status} />
        </SheetTitle>
        <SheetDescription>
          Reported {formatAge(incident.reportedAt, now)} · {formatDateTime(incident.reportedAt)} · #{shortId(incident.id)}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 border-b p-4">
          <div className="flex flex-wrap gap-2">
            {isOpenIncident(incident.status) && (
              <Button onClick={() => openDispatch(incident.id)}>
                <Truck />
                Dispatch team
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsFlagging(true)}>
              <Flag />
              Flag for review
            </Button>
            <Button variant="outline" onClick={() => setIsPlacingPin(true)}>
              <MapPinPen />
              {location ? 'Move pin' : 'Set location'}
            </Button>
            {location && (
              <Button variant="ghost" onClick={showOnMap}>
                <LocateFixed />
                Show on map
              </Button>
            )}
          </div>
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Change status</p>
            <div className="flex flex-wrap gap-2">
              {officialStatusTargets(incident.status).map((target) => (
                <Button
                  key={target}
                  size="sm"
                  variant="outline"
                  className={isRejection(target) ? 'border-destructive/40 text-destructive hover:bg-destructive/10' : undefined}
                  onClick={() => setStatusTarget(target)}
                >
                  {STATUS_ACTION_LABELS[target]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {pendingReviews.length > 0 && (
          <div role="note" className="border-b bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Waiting for review</p>
            <p>
              {pendingReviews.map((review) => REVIEW_REASON_LABELS[review.reason]).join(', ')}. Resolve it on the Reviews page
              once you have decided.
            </p>
          </div>
        )}

        <div className="grid gap-6 p-4">
          <IncidentFacts incident={incident} />
          {location && (
            <IncidentLocationMap
              incident={{ ...incident, lat: location.lat, lon: location.lon }}
              accuracyM={incident.accuracyM}
            />
          )}
          <DrawerSection title="Missions">
            <IncidentMissions incidentId={incident.id} />
          </DrawerSection>
          <DrawerSection title="Photos">
            <IncidentPhotos incidentId={incident.id} />
          </DrawerSection>
          <DrawerSection title="History">
            <IncidentTimeline entries={incident.timeline} />
          </DrawerSection>
        </div>
      </div>

      <StatusChangeDialog
        incident={incident}
        target={statusTarget}
        suggestedDuplicateOf={suggestedDuplicateOf}
        onClose={() => setStatusTarget(null)}
      />
      <FlagIncidentDialog incident={incident} open={isFlagging} onOpenChange={setIsFlagging} />
      <SetLocationDialog incident={incident} open={isPlacingPin} onOpenChange={setIsPlacingPin} />
    </>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
