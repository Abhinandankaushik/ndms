import { Siren } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { RescuePortalRuntime } from '@/components/rescue/RescuePortalRuntime';
import { AppShell } from '@/components/shell/AppShell';
import { BottomNav } from '@/components/shell/PortalNav';

export const metadata: Metadata = {
  title: 'Rescue team',
};

export default function RescueLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['RESCUE_TEAM']}>
      <AppShell
        portalName="Rescue team"
        bottomNav={<BottomNav items={[{ href: '/rescue', label: 'Missions', icon: <Siren /> }]} />}
      >
        <RescuePortalRuntime />
        {children}
      </AppShell>
    </RequireRole>
  );
}
