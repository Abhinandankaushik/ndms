import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { CitizenBottomNav } from '@/components/citizen/navigation/CitizenBottomNav';
import { CitizenLiveNotifications } from '@/components/citizen/notifications/CitizenLiveNotifications';
import { AppShell } from '@/components/shell/AppShell';

export const metadata: Metadata = {
  title: 'Citizen',
};

export default function CitizenLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['CITIZEN', 'VOLUNTEER']}>
      <AppShell portalName="Citizen" bottomNav={<CitizenBottomNav />}>
        <CitizenLiveNotifications />
        {children}
      </AppShell>
    </RequireRole>
  );
}
