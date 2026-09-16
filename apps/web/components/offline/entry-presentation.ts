import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import type { OutboxEntry } from '@/lib/offline/types';

export function entryTitle(entry: OutboxEntry): string {
  return entry.kind === 'SOS' ? 'SOS' : DISASTER_TYPE_LABELS[entry.body.type];
}

export function entryStatusText(entry: OutboxEntry, isOnline: boolean): string {
  switch (entry.status) {
    case 'PENDING':
      return isOnline ? 'Waiting to send…' : 'Waiting for a connection';
    case 'CONFLICT':
      return 'Already recorded';
    case 'INVALID':
      return 'Not accepted';
  }
}

export function queueSummary(
  waiting: readonly OutboxEntry[],
  blocked: readonly OutboxEntry[],
  isOnline: boolean,
  isSending: boolean,
): string {
  if (blocked.length > 0) {
    return `${countOf(blocked.length, 'report')} ${blocked.length === 1 ? 'needs' : 'need'} your attention`;
  }
  if (waiting.length === 0) return 'You are offline. NDMS is showing the last information it saved.';

  // A waiting SOS outranks whatever else is queued behind it: that is the one thing the person needs.
  if (waiting.some((entry) => entry.kind === 'SOS')) {
    if (isSending) return 'Sending your SOS…';
    return isOnline
      ? 'Your SOS is saved and about to be sent.'
      : 'You are offline. Your SOS is saved and will be sent automatically.';
  }

  if (isSending) return `Sending ${countOf(waiting.length, 'report')}…`;
  const saved = `${countOf(waiting.length, 'report')} saved on this phone`;
  return isOnline ? `${saved}, ready to send.` : `You are offline. ${saved}.`;
}

function countOf(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
