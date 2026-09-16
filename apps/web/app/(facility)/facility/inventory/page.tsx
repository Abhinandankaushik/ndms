import type { Metadata } from 'next';
import { InventoryScreen } from '@/components/facility/InventoryScreen';

export const metadata: Metadata = {
  title: 'Supplies',
};

export default function FacilityInventoryPage() {
  return <InventoryScreen />;
}
