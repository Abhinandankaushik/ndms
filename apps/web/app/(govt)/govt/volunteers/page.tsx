import type { Metadata } from 'next';
import { VolunteersView } from '@/components/govt/volunteers/VolunteersView';

export const metadata: Metadata = {
  title: 'Volunteers',
};

export default function GovtVolunteersPage() {
  return <VolunteersView />;
}
