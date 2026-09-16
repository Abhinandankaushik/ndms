import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { GovtSideNav } from '@/components/govt/GovtSideNav';
import { GovtWorkspace } from '@/components/govt/GovtWorkspace';
import { AppShell } from '@/components/shell/AppShell';

export const metadata: Metadata = {
  title: 'Control room',
};

export default function GovtLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['GOVT_OFFICIAL']}>
      <AppShell portalName="Control room" sideNav={<GovtSideNav />}>
        {children}
        <GovtWorkspace />
      </AppShell>
    </RequireRole>
  );
}
