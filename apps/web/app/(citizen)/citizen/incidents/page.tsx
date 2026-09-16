import type { Metadata } from 'next';
import { MyIncidentsList } from '@/components/citizen/incidents/MyIncidentsList';

export const metadata: Metadata = {
  title: 'My reports',
};

export default function MyIncidentsPage() {
  return <MyIncidentsList />;
}
