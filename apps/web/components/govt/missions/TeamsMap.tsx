'use client';

import dynamic from 'next/dynamic';
import { BaseMap } from '@/components/map/BaseMap';
import type { LatLon, Team } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import type { MissionLink } from './TeamsMapLayers';

const TeamsMapLayers = dynamic(() => import('./TeamsMapLayers').then((module) => module.TeamsMapLayers), { ssr: false });

export function TeamsMap({
  teams,
  links,
  focus,
  onSelectTeam,
  className,
}: {
  teams: readonly Team[];
  links: readonly MissionLink[];
  focus: (LatLon & { requestedAt: number }) | null;
  onSelectTeam: (teamId: string) => void;
  className?: string;
}) {
  return (
    <BaseMap className={cn('rounded-xl border', className)}>
      <TeamsMapLayers teams={teams} links={links} focus={focus} onSelectTeam={onSelectTeam} />
    </BaseMap>
  );
}
