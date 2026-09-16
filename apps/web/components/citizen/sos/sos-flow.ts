import { useEffect } from 'react';
import { create } from 'zustand';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { requestDeviceFix } from '@/components/citizen/location/geolocation';
import { toast } from '@/components/ui/toaster';
import { queryKeys } from '@/lib/api/query-keys';
import type { SosInput } from '@/lib/api/types';
import { createClientUuid } from '@/lib/client-uuid';
import { getQueryClient } from '@/lib/query/query-client';
import { submitSos } from './submit';

export type SosPhase =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'sending'; payload: SosInput }
  | { kind: 'sent'; incidentId: string }
  | { kind: 'queued'; payload: SosInput }
  | { kind: 'failed'; payload: SosInput; message: string };

interface SosFlowState {
  phase: SosPhase;
  mountedSosScreens: number;
}

// Module state rather than component state: a send must finish, and be reported, even if the person leaves the
// SOS screen while it is in flight.
const useSosFlowStore = create<SosFlowState>()(() => ({ phase: { kind: 'idle' }, mountedSosScreens: 0 }));

export const useSosPhase = () => useSosFlowStore((state) => state.phase);

export async function startSos(): Promise<void> {
  const { phase } = useSosFlowStore.getState();
  if (phase.kind === 'failed') return retrySos();
  if (phase.kind !== 'idle' && phase.kind !== 'sent') return;

  const clientUuid = createClientUuid();
  const reportedAt = new Date().toISOString();
  setPhase({ kind: 'locating' });
  const fix = await requestDeviceFix().catch(() => null);
  await send({
    clientUuid,
    reportedAt,
    lat: fix?.lat ?? null,
    lon: fix?.lon ?? null,
    accuracyM: fix?.accuracyM ?? null,
    type: 'OTHER',
    peopleAffected: 1,
  });
}

// Resends the identical payload, so an attempt that did reach the server is recognised by its clientUuid
// instead of becoming a second SOS.
export async function retrySos(): Promise<void> {
  const { phase } = useSosFlowStore.getState();
  if (phase.kind === 'failed') await send(phase.payload);
}

export function dismissSosOutcome(): void {
  const { phase } = useSosFlowStore.getState();
  if (phase.kind === 'failed' || phase.kind === 'queued') setPhase({ kind: 'idle' });
}

export function acknowledgeSentSos(incidentId: string): void {
  const { phase } = useSosFlowStore.getState();
  if (phase.kind === 'sent' && phase.incidentId === incidentId) setPhase({ kind: 'idle' });
}

export function useSosScreenPresence(): void {
  useEffect(() => {
    useSosFlowStore.setState((state) => ({ mountedSosScreens: state.mountedSosScreens + 1 }));
    return () => useSosFlowStore.setState((state) => ({ mountedSosScreens: state.mountedSosScreens - 1 }));
  }, []);
}

async function send(payload: SosInput): Promise<void> {
  setPhase({ kind: 'sending', payload });
  try {
    const outcome = await submitSos(payload);
    if (outcome.kind === 'queued') {
      setPhase({ kind: 'queued', payload });
      return;
    }
    setPhase({ kind: 'sent', incidentId: outcome.receipt.id });
    void getQueryClient().invalidateQueries({ queryKey: queryKeys.incidents.mine });
    if (useSosFlowStore.getState().mountedSosScreens === 0) {
      toast({
        title: 'SOS sent',
        description: 'NDMS received your SOS. Open Reports to follow it.',
        variant: 'success',
        durationMs: 0,
      });
    }
  } catch (error) {
    setPhase({ kind: 'failed', payload, message: describeApiError(error, 'Your SOS could not be sent.') });
  }
}

function setPhase(phase: SosPhase): void {
  useSosFlowStore.setState({ phase });
}
