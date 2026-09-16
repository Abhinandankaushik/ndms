import { create } from 'zustand';
import type { FacilityCapacityAlertEvent } from '@/lib/api/types';

interface CapacityAlertState {
  alert: FacilityCapacityAlertEvent | null;
}

export const useCapacityAlertStore = create<CapacityAlertState>()(() => ({ alert: null }));

export function showCapacityAlert(alert: FacilityCapacityAlertEvent): void {
  useCapacityAlertStore.setState({ alert });
}

export function dismissCapacityAlert(): void {
  useCapacityAlertStore.setState({ alert: null });
}
