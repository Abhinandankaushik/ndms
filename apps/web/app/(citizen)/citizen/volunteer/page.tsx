import type { Metadata } from 'next';
import { VolunteerHub } from '@/components/citizen/volunteer/VolunteerHub';

export const metadata: Metadata = {
  title: 'Volunteer',
};

export default function VolunteerPage() {
  return <VolunteerHub />;
}
