import type { Metadata } from 'next';
import { IncidentStatusView, type JustSent } from '@/components/citizen/incidents/IncidentStatusView';

export const metadata: Metadata = {
  title: 'Report status',
};

interface IncidentPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncidentPage({ params, searchParams }: IncidentPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <IncidentStatusView key={id} incidentId={id} justSent={parseJustSent(query.sent)} />;
}

function parseJustSent(value: string | string[] | undefined): JustSent {
  return value === 'sos' || value === 'report' ? value : null;
}
