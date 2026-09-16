import { withTransientRetries, type SubmissionOutcome } from '@/components/citizen/common/submission';
import { reportIncident } from '@/lib/api/endpoints/incidents';
import type { ReportInput } from '@/lib/api/types';
import { sendThroughOutbox } from '@/lib/offline/send';

// The only place a detailed report touches the network. It is written to the outbox before the request
// leaves, so a report resolves { kind: 'queued' } rather than being lost when the connection is not there.
export function submitReport(payload: ReportInput): Promise<SubmissionOutcome> {
  return sendThroughOutbox({ kind: 'REPORT', body: payload }, () => withTransientRetries(() => reportIncident(payload)));
}
