import type { Metadata } from 'next';
import { MissionDetailView } from '@/components/rescue/MissionDetailView';

export const metadata: Metadata = {
  title: 'Mission',
};

export default async function RescueMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MissionDetailView missionId={id} />;
}
