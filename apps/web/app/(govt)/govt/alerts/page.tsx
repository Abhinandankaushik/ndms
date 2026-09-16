import type { Metadata } from 'next';
import { AlertsView } from '@/components/govt/alerts/AlertsView';

export const metadata: Metadata = {
  title: 'Alerts',
};

export default function GovtAlertsPage() {
  return <AlertsView />;
}
