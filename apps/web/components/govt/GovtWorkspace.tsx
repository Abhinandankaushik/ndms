'use client';

import { DispatchDialog } from './dispatch/DispatchDialog';
import { IncidentDrawer } from './incident/IncidentDrawer';
import { useGovtRealtime } from './realtime/useGovtRealtime';

/** Portal-wide pieces mounted once: the realtime cache bridge and the overlays every page can open. */
export function GovtWorkspace() {
  useGovtRealtime();

  return (
    <>
      <IncidentDrawer />
      <DispatchDialog />
    </>
  );
}
