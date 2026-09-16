import type { Metadata } from 'next';
import { MissionListView } from '@/components/rescue/MissionListView';

export const metadata: Metadata = {
  title: 'Missions',
};

export default function RescueMissionsPage() {
  return <MissionListView />;
}
