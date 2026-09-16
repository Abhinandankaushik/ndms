import {
  Activity,
  BuildingComplex,
  Flame,
  Mountain,
  Tornado,
  TriangleAlert,
  WavesHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  OPEN_INCIDENT_STATUSES,
  type DisasterType,
  type IncidentStatus,
  type IncidentTimelineEntry,
} from '@/lib/api/types';

export const DISASTER_TYPE_ICONS: Record<DisasterType, LucideIcon> = {
  FLOOD: WavesHorizontal,
  EARTHQUAKE: Activity,
  FIRE: Flame,
  CYCLONE: Tornado,
  LANDSLIDE: Mountain,
  BUILDING_COLLAPSE: BuildingComplex,
  OTHER: TriangleAlert,
};

export const STATUS_BADGE_CLASSES: Record<IncidentStatus, string> = {
  REPORTED: 'border-amber-600 bg-amber-100 text-amber-950',
  VERIFIED: 'border-sky-700 bg-sky-100 text-sky-950',
  ASSIGNED: 'border-blue-700 bg-blue-100 text-blue-950',
  IN_PROGRESS: 'border-violet-700 bg-violet-100 text-violet-950',
  RESOLVED: 'border-emerald-700 bg-emerald-100 text-emerald-950',
  REJECTED_DUPLICATE: 'border-zinc-500 bg-zinc-100 text-zinc-900',
  REJECTED_FAKE: 'border-zinc-500 bg-zinc-100 text-zinc-900',
};

export interface StatusGuidance {
  headline: string;
  detail: string;
}

// Written for the person who asked for help: only what the status actually establishes, no promises about
// what happens next.
export const STATUS_GUIDANCE: Record<IncidentStatus, StatusGuidance> = {
  REPORTED: {
    headline: 'Received by NDMS',
    detail: 'Officials in the district control room can see it. It is waiting for an official to review it.',
  },
  VERIFIED: {
    headline: 'Confirmed by an official',
    detail: 'An official has reviewed your report. No rescue team is assigned yet.',
  },
  ASSIGNED: {
    headline: 'Rescue team assigned',
    detail: 'A rescue team has been assigned to your report.',
  },
  IN_PROGRESS: {
    headline: 'Rescue under way',
    detail: 'The rescue team is on its way or already working on this.',
  },
  RESOLVED: {
    headline: 'Resolved',
    detail: 'Responders marked this report as resolved. If you still need help, send a new SOS or call 112.',
  },
  REJECTED_DUPLICATE: {
    headline: 'Merged with another report',
    detail: 'Someone reported the same event, so responders are handling it under that report.',
  },
  REJECTED_FAKE: {
    headline: 'Closed after review',
    detail: 'An official reviewed this report and closed it. If you still need help, send a new SOS or call 112.',
  },
};

const TIMELINE_LABELS: Record<IncidentStatus, string> = {
  REPORTED: 'Reopened',
  VERIFIED: 'Confirmed by an official',
  ASSIGNED: 'Rescue team assigned',
  IN_PROGRESS: 'Rescue under way',
  RESOLVED: 'Marked resolved',
  REJECTED_DUPLICATE: 'Merged with another report',
  REJECTED_FAKE: 'Closed after review',
};

export function timelineLabel(entry: IncidentTimelineEntry): string {
  return entry.fromStatus === null ? 'Received by NDMS' : TIMELINE_LABELS[entry.toStatus];
}

export function isOpenStatus(status: IncidentStatus): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status);
}
