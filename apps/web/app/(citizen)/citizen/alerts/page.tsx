import type { Metadata } from 'next';
import { AlertFeed } from '@/components/citizen/alerts/AlertFeed';

export const metadata: Metadata = {
  title: 'Alerts',
};

export default function AlertsPage() {
  return <AlertFeed />;
}
