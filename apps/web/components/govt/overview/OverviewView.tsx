'use client';

import { OverviewMap } from '../map/OverviewMap';
import { IncidentFilterBar } from './IncidentFilterBar';
import { IncidentQueuePanel } from './IncidentQueuePanel';
import { KpiStrip } from './KpiStrip';

// On a desktop control-room screen the overview fills exactly one viewport below the header, so the map and the
// queue scroll inside themselves; on tablets the sections stack and the page scrolls.
export function OverviewView() {
  return (
    <div className="flex flex-col gap-3 px-3 py-3 lg:px-4 xl:h-[calc(100dvh-3.5rem)] xl:overflow-hidden">
      <h1 className="sr-only">Overview</h1>
      <KpiStrip />
      <IncidentFilterBar />
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <OverviewMap className="h-[60vh] min-h-96 xl:h-full xl:min-h-0" />
        <IncidentQueuePanel className="max-h-[80vh] xl:max-h-none" />
      </div>
    </div>
  );
}
