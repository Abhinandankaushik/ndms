import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ApiError } from '../../common/http/api-envelope';
import type { AuthUser } from '../auth/auth-user';
import { IncidentsService, type ReportReceipt } from '../incidents/incidents.service';
import type { ParsedSyncItem, SyncItem } from './sync.schemas';

export type SyncOutcome = 'CREATED' | 'DUPLICATE' | 'CONFLICT' | 'INVALID';

export interface SyncResult {
  clientUuid: string | null;
  outcome: SyncOutcome;
  id?: string;
  error?: ApiError;
}

const RETRYABLE_REFUSALS: ReadonlySet<number> = new Set([HttpStatus.REQUEST_TIMEOUT, HttpStatus.TOO_MANY_REQUESTS]);

@Injectable()
export class SyncService {
  constructor(private readonly incidents: IncidentsService) {}

  // Items run one at a time in request order, so a clientUuid repeated inside one batch
  // resolves deterministically: the first copy is CREATED, later copies are DUPLICATE.
  async syncBatch(items: readonly ParsedSyncItem[], user: AuthUser): Promise<{ results: SyncResult[] }> {
    const results: SyncResult[] = [];
    for (const parsed of items) {
      results.push(await this.syncItem(parsed, user));
    }
    return { results };
  }

  private async syncItem(parsed: ParsedSyncItem, user: AuthUser): Promise<SyncResult> {
    if ('rejected' in parsed) {
      return { clientUuid: parsed.rejected.clientUuid, outcome: 'INVALID', error: parsed.rejected.error };
    }

    const { clientUuid } = parsed.item.body;
    try {
      const receipt = await this.record(parsed.item, user);
      return { clientUuid, outcome: receipt.wasInserted ? 'CREATED' : 'DUPLICATE', id: receipt.id };
    } catch (error) {
      const refusal = refusalOf(error);
      if (!refusal) throw error;
      return { clientUuid, outcome: refusal.code === 'CLIENT_UUID_CONFLICT' ? 'CONFLICT' : 'INVALID', error: refusal };
    }
  }

  private record(item: SyncItem, user: AuthUser): Promise<ReportReceipt> {
    return item.kind === 'SOS' ? this.incidents.reportSos(item.body, user) : this.incidents.reportDetailed(item.body, user);
  }
}

// A 4xx refuses the item as sent, and sending it again would be refused again, so it is
// answered per item. Anything else fails the batch at that item: INVALID would make the
// client drop a report that a later retry could still deliver, and carrying on while the
// database is failing would only add a timeout per remaining item. When the client
// resends the batch, the items already stored come back as DUPLICATE.
function refusalOf(error: unknown): ApiError | null {
  if (!(error instanceof HttpException)) return null;
  const status = error.getStatus();
  if (status >= 500 || RETRYABLE_REFUSALS.has(status)) return null;

  const body = error.getResponse();
  const { code, message, details } = (typeof body === 'object' ? body : {}) as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  return {
    code: typeof code === 'string' ? code : (HttpStatus[status] ?? 'ERROR'),
    message: typeof message === 'string' ? message : error.message,
    ...(details === undefined ? {} : { details }),
  };
}
