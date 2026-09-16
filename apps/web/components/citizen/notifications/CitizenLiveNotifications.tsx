'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { alertCoversPosition } from '@/components/citizen/alerts/geofence';
import { isUrgentSeverity } from '@/components/citizen/alerts/presentation';
import { useMyIncidentsLiveUpdates } from '@/components/citizen/incidents/live-updates';
import { STATUS_GUIDANCE } from '@/components/citizen/incidents/presentation';
import { getLastKnownFix } from '@/components/citizen/location/geolocation';
import { toast } from '@/components/ui/toaster';
import { queryKeys } from '@/lib/api/query-keys';
import { refreshAccessToken } from '@/lib/auth/session';
import { ALERT_SEVERITY_LABELS } from '@/lib/labels';
import { useSocketEvent } from '@/lib/realtime/socket';

const ALERTS_PATH = '/citizen/alerts';
const MAX_TOAST_MESSAGE_LENGTH = 160;

export function CitizenLiveNotifications() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useSocketEvent('volunteer:reviewed', (review) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.me });
    if (review.verificationStatus === 'VERIFIED') {
      // The new token carries the VOLUNTEER role, which moves the live connection into the volunteer room.
      refreshAccessToken().catch(() => undefined);
      toast({
        title: 'You are now a verified volunteer',
        description: 'Open Volunteer to see tasks near you.',
        variant: 'success',
        durationMs: 0,
      });
    } else if (review.verificationStatus === 'REJECTED') {
      toast({
        title: 'Volunteer application not approved',
        description: review.rejectionReason ?? 'Open Volunteer to see the details.',
        variant: 'destructive',
        durationMs: 0,
      });
    }
  });

  useMyIncidentsLiveUpdates((event) => {
    if (pathname === `/citizen/incidents/${event.id}`) return;
    toast({
      title: `Update on your report: ${STATUS_GUIDANCE[event.to].headline}`,
      description: 'Open My reports to see the details.',
      variant: event.to === 'RESOLVED' ? 'success' : 'default',
      durationMs: 10_000,
    });
  });

  useSocketEvent('alert:broadcast', (alert) => {
    if (pathname === ALERTS_PATH) return;
    const position = getLastKnownFix();
    const urgent = isUrgentSeverity(alert.severity);

    // Without a known position a geofenced alert may or may not apply, so the person is pointed to the feed,
    // which asks for their location, instead of being warned about an area they may not be in.
    if (alert.geofence && !position) {
      toast({
        title: `${ALERT_SEVERITY_LABELS[alert.severity]} alert for part of the district`,
        description: `${alert.title}. Open Alerts to check whether it covers where you are.`,
        variant: urgent ? 'destructive' : 'default',
        durationMs: urgent ? 0 : 15_000,
      });
      return;
    }
    if (!alertCoversPosition(alert, position)) return;

    toast({
      title: `${ALERT_SEVERITY_LABELS[alert.severity]} alert: ${alert.title}`,
      description: truncate(alert.message, MAX_TOAST_MESSAGE_LENGTH),
      variant: urgent ? 'destructive' : 'default',
      durationMs: urgent ? 0 : 15_000,
    });
    if (urgent) navigator.vibrate?.([300, 150, 300]);
  });

  return null;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
