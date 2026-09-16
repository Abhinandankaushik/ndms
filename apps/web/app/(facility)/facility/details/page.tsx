import type { Metadata } from 'next';
import { FacilityDetailsScreen } from '@/components/facility/FacilityDetailsScreen';

export const metadata: Metadata = {
  title: 'Facility details',
};

export default function FacilityDetailsPage() {
  return <FacilityDetailsScreen />;
}
