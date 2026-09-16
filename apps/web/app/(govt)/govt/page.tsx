import type { Metadata } from 'next';
import { OverviewView } from '@/components/govt/overview/OverviewView';

export const metadata: Metadata = {
  title: 'Overview',
};

export default function GovtOverviewPage() {
  return <OverviewView />;
}
