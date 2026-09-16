'use client';

import { useQuery } from '@tanstack/react-query';
import { Eraser, Pentagon, PencilLine, Undo2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Alert, LatLon } from '@/lib/api/types';
import { PageContainer, PageHeader } from '../common/PageHeader';
import { useNow } from '../lib/useNow';
import { alertHistoryQuery } from '../queries';
import { AlertComposer } from './AlertComposer';
import { AlertHistory } from './AlertHistory';
import { GeofenceMap } from './GeofenceMap';
import { MIN_GEOFENCE_VERTICES, alertState, geofenceBounds, type LatLngBoundsTuple } from './geofence';

// Clicks this close together (about a metre) are a double click, not a new corner.
const DUPLICATE_VERTEX_DEGREES = 0.00001;

export function AlertsView() {
  const now = useNow();
  const { data: history } = useQuery(alertHistoryQuery());
  const [vertices, setVertices] = useState<LatLon[]>([]);
  const [closed, setClosed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState<{ bounds: LatLngBoundsTuple; requestedAt: number } | null>(null);

  const mapAlerts = useMemo(
    () =>
      (history ?? []).filter(
        (alert) => alert.geofence && (alert.id === highlightedAlertId || alertState(alert, now) === 'active'),
      ),
    [history, highlightedAlertId, now],
  );

  const addVertex = useCallback((vertex: LatLon) => {
    setVertices((current) => {
      const last = current.at(-1);
      const repeated =
        last && Math.abs(last.lat - vertex.lat) < DUPLICATE_VERTEX_DEGREES && Math.abs(last.lon - vertex.lon) < DUPLICATE_VERTEX_DEGREES;
      return repeated ? current : [...current, vertex];
    });
  }, []);

  const closeShape = useCallback(() => {
    setClosed(true);
    setDrawing(false);
  }, []);

  const undo = () => {
    if (closed) {
      setClosed(false);
      setDrawing(true);
      return;
    }
    setVertices((current) => current.slice(0, -1));
  };

  const clearArea = useCallback(() => {
    setVertices([]);
    setClosed(false);
    setDrawing(false);
  }, []);

  const showArea = (alert: Alert) => {
    if (!alert.geofence) return;
    const bounds = geofenceBounds(alert.geofence);
    setHighlightedAlertId(alert.id);
    if (bounds) setFitRequest({ bounds, requestedAt: Date.now() });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Alerts"
        description="Broadcast a warning to citizens, volunteers and responders. Draw an area on the map to reach only the people inside it; without one, the whole audience receives it."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <AlertComposer area={{ vertices, closed }} onSent={clearArea} />

        <section aria-label="Alert area" className="grid content-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={drawing ? 'default' : 'outline'}
              aria-pressed={drawing}
              disabled={closed}
              onClick={() => setDrawing((current) => !current)}
            >
              <PencilLine />
              {drawing ? 'Drawing: click the map' : vertices.length > 0 ? 'Continue drawing' : 'Draw area'}
            </Button>
            <Button variant="outline" onClick={closeShape} disabled={closed || vertices.length < MIN_GEOFENCE_VERTICES}>
              <Pentagon />
              Close shape
            </Button>
            <Button variant="outline" onClick={undo} disabled={vertices.length === 0}>
              <Undo2 />
              Undo
            </Button>
            <Button variant="ghost" onClick={clearArea} disabled={vertices.length === 0 && !drawing}>
              <Eraser />
              Clear
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {areaStatus(vertices.length, closed, drawing)}
            </p>
          </div>
          <GeofenceMap
            className="h-[520px] xl:h-[640px]"
            vertices={vertices}
            closed={closed}
            drawing={drawing}
            onAddVertex={addVertex}
            onCloseShape={closeShape}
            alerts={mapAlerts}
            highlightedAlertId={highlightedAlertId}
            fitRequest={fitRequest}
          />
          <p className="text-xs text-muted-foreground">
            Outlined areas belong to alerts that are still active. The dashed line is the district boundary.
          </p>
        </section>
      </div>

      <AlertHistory highlightedAlertId={highlightedAlertId} onShowArea={showArea} />
    </PageContainer>
  );
}

function areaStatus(vertexCount: number, closed: boolean, drawing: boolean): string {
  if (closed) return `Area closed with ${vertexCount} corners.`;
  if (vertexCount === 0) return drawing ? 'Click the map to place the first corner.' : 'No area: the alert reaches the whole audience.';
  if (vertexCount < MIN_GEOFENCE_VERTICES) return `${vertexCount} of at least ${MIN_GEOFENCE_VERTICES} corners placed.`;
  return `${vertexCount} corners. Click the first corner or "Close shape" to finish.`;
}
