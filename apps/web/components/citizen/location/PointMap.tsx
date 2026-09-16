'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const PointMap = dynamic(() => import('./PointMapView').then((module) => module.PointMapView), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
});
