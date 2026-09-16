import type { Metadata } from 'next';
import { MissionsView } from '@/components/govt/missions/MissionsView';

export const metadata: Metadata = {
  title: 'Missions & teams',
};

export default function GovtMissionsPage() {
  return <MissionsView />;
}
