import {
  Activity,
  Baby,
  BuildingComplex,
  Flame,
  HeartPulse,
  Mountain,
  PersonStanding,
  Tornado,
  TriangleAlert,
  WavesHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DisasterType, Incident, MissionStatus } from '@/lib/api/types';
import { MISSION_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

// Solid fills rather than tints: pale badges wash out in direct sunlight.
const STATUS_FILL: Record<MissionStatus, string> = {
  ASSIGNED: 'bg-amber-400 text-amber-950',
  ACCEPTED: 'bg-slate-900 text-white',
  EN_ROUTE: 'bg-blue-700 text-white',
  ON_SITE: 'bg-violet-700 text-white',
  COMPLETED: 'bg-emerald-700 text-white',
  REJECTED: 'bg-zinc-300 text-zinc-950',
  CANCELLED: 'bg-zinc-300 text-zinc-950',
};

export function MissionStatusBadge({ status, className }: { status: MissionStatus; className?: string }) {
  return (
    <Badge className={cn('border-transparent px-2.5 py-1 text-sm font-bold', STATUS_FILL[status], className)}>
      {status === 'ASSIGNED' ? 'Needs response' : MISSION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SosBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded-md bg-red-700 px-2 py-0.5 text-sm font-black tracking-wider text-white', className)}>
      SOS
    </span>
  );
}

const DISASTER_TYPE_ICONS: Record<DisasterType, LucideIcon> = {
  FLOOD: WavesHorizontal,
  EARTHQUAKE: Activity,
  FIRE: Flame,
  CYCLONE: Tornado,
  LANDSLIDE: Mountain,
  BUILDING_COLLAPSE: BuildingComplex,
  OTHER: TriangleAlert,
};

export function DisasterTypeIcon({ type, className }: { type: DisasterType; className?: string }) {
  const Icon = DISASTER_TYPE_ICONS[type];
  return <Icon aria-hidden className={className} />;
}

type VulnerabilityFlagsSource = Pick<Incident, 'hasInjured' | 'hasElderly' | 'hasChildren'>;

export function VulnerabilityFlags({ incident, className }: { incident: VulnerabilityFlagsSource; className?: string }) {
  const flags: { label: string; Icon: LucideIcon }[] = [];
  if (incident.hasInjured) flags.push({ label: 'Injured', Icon: HeartPulse });
  if (incident.hasElderly) flags.push({ label: 'Elderly', Icon: PersonStanding });
  if (incident.hasChildren) flags.push({ label: 'Children', Icon: Baby });
  if (flags.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="People at higher risk">
      {flags.map(({ label, Icon }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 rounded-md border-2 border-amber-600 bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-950"
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </li>
      ))}
    </ul>
  );
}
