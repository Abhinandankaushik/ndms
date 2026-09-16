import type { Metadata } from 'next';
import { ReportForm } from '@/components/citizen/report/ReportForm';

export const metadata: Metadata = {
  title: 'Report an incident',
};

export default function ReportPage() {
  return <ReportForm />;
}
