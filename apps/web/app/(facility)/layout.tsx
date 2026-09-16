import { ClipboardList, Package, Settings2, Users } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { CapacityAlertBanner } from '@/components/facility/CapacityAlertBanner';
import { FacilityLiveUpdates } from '@/components/facility/FacilityLiveUpdates';
import { AppShell } from '@/components/shell/AppShell';
import { BottomNav, type NavItem } from '@/components/shell/PortalNav';

export const metadata: Metadata = {
  title: 'Facility',
};

const FACILITY_NAV: readonly NavItem[] = [
  { href: '/facility', label: 'Occupancy', icon: <Users />, exact: true },
  { href: '/facility/inventory', label: 'Supplies', icon: <Package /> },
  { href: '/facility/tasks', label: 'Tasks', icon: <ClipboardList /> },
  { href: '/facility/details', label: 'Details', icon: <Settings2 /> },
];

export default function FacilityLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['FACILITY_MANAGER']}>
      <AppShell portalName="Facility" bottomNav={<BottomNav items={FACILITY_NAV} />}>
        <FacilityLiveUpdates />
        <CapacityAlertBanner />
        {children}
      </AppShell>
    </RequireRole>
  );
}
