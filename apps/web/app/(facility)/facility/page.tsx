import type { Metadata } from 'next';
import { MyFacilityScreen } from '@/components/facility/MyFacilityScreen';

export const metadata: Metadata = {
  title: 'My facility',
};

export default function FacilityHomePage() {
  return <MyFacilityScreen />;
}
