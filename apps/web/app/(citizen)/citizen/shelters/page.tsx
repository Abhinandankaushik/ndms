import type { Metadata } from 'next';
import { ShelterFinder } from '@/components/citizen/shelters/ShelterFinder';

export const metadata: Metadata = {
  title: 'Shelters',
};

export default function SheltersPage() {
  return <ShelterFinder />;
}
