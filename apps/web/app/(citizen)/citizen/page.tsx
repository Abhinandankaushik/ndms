import type { Metadata } from 'next';
import { CitizenHome } from '@/components/citizen/home/CitizenHome';

export const metadata: Metadata = {
  title: 'SOS',
};

export default function CitizenHomePage() {
  return <CitizenHome />;
}
