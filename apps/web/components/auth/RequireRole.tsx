'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SplashScreen } from '@/components/shell/SplashScreen';
import type { UserRole } from '@/lib/api/types';
import { homePathForRole, useSessionStatus, useSessionUser } from '@/lib/auth/session';

export interface RequireRoleProps {
  roles: readonly UserRole[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const router = useRouter();
  const status = useSessionStatus();
  const role = useSessionUser()?.role ?? null;
  const allowedRoles = roles.join(',');
  const isAllowed = status === 'authenticated' && role !== null && roles.includes(role);

  useEffect(() => {
    if (status === 'anonymous') {
      const requested = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(requested)}`);
      return;
    }
    if (status === 'authenticated' && role && !allowedRoles.split(',').includes(role)) {
      router.replace(homePathForRole(role));
    }
  }, [status, role, allowedRoles, router]);

  if (!isAllowed) {
    return <SplashScreen message={status === 'unknown' ? 'Checking your session…' : 'Redirecting…'} />;
  }
  return children;
}
