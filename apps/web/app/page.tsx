'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SplashScreen } from '@/components/shell/SplashScreen';
import { homePathForRole, useSessionStatus, useSessionUser } from '@/lib/auth/session';

export default function IndexPage() {
  const router = useRouter();
  const status = useSessionStatus();
  const role = useSessionUser()?.role ?? null;

  useEffect(() => {
    if (status === 'authenticated' && role) router.replace(homePathForRole(role));
    else if (status === 'anonymous') router.replace('/login');
  }, [status, role, router]);

  return <SplashScreen message="Opening NDMS…" />;
}
