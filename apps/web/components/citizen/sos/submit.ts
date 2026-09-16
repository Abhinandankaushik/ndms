import { withTransientRetries, type SubmissionOutcome } from '@/components/citizen/common/submission';
import { reportSos } from '@/lib/api/endpoints/incidents';
import type { SosInput } from '@/lib/api/types';
import { sendThroughOutbox } from '@/lib/offline/send';

// The only place an SOS touches the network. It is written to the outbox before the request leaves, so
// a phone with no signal answers { kind: 'queued' } instead of losing the call for help.
export function submitSos(payload: SosInput): Promise<SubmissionOutcome> {
  return sendThroughOutbox({ kind: 'SOS', body: payload }, () => withTransientRetries(() => reportSos(payload)));
}
