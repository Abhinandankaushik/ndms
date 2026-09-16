import type { Metadata } from 'next';
import { ResourcesView } from '@/components/govt/resources/ResourcesView';

export const metadata: Metadata = {
  title: 'Resources',
};

export default function GovtResourcesPage() {
  return <ResourcesView />;
}
