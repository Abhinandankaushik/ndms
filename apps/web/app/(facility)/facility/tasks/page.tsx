import type { Metadata } from 'next';
import { VolunteerTasksScreen } from '@/components/facility/VolunteerTasksScreen';

export const metadata: Metadata = {
  title: 'Volunteer tasks',
};

export default function FacilityTasksPage() {
  return <VolunteerTasksScreen />;
}
