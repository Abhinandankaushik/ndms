import { z } from 'zod';
import type { ApiError } from '../../common/http/api-envelope';
import { reportSchema, sosSchema, type ReportInput, type SosInput } from '../incidents/incidents.schemas';

export const MAX_SYNC_ITEMS = 50;

export type SyncItem = { kind: 'SOS'; body: SosInput } | { kind: 'REPORT'; body: ReportInput };

export type ParsedSyncItem = { item: SyncItem } | { rejected: { clientUuid: string | null; error: ApiError } };

const syncItemEnvelopeSchema = z.object({
  kind: z.enum(['SOS', 'REPORT']),
  body: z.unknown(),
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// Lets the client match a rejected item to its outbox entry even when the item is broken.
function claimedClientUuid(raw: unknown): string | null {
  const body = isRecord(raw) ? raw.body : undefined;
  const clientUuid = isRecord(body) ? body.clientUuid : undefined;
  return typeof clientUuid === 'string' ? clientUuid : null;
}

const rejected = (raw: unknown, error: z.ZodError): ParsedSyncItem => ({
  rejected: {
    clientUuid: claimedClientUuid(raw),
    error: { code: 'VALIDATION_FAILED', message: 'Item validation failed', details: z.flattenError(error) },
  },
});

export function parseSyncItem(raw: unknown): ParsedSyncItem {
  const envelope = syncItemEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return rejected(raw, envelope.error);

  if (envelope.data.kind === 'SOS') {
    const body = sosSchema.safeParse(envelope.data.body);
    return body.success ? { item: { kind: 'SOS', body: body.data } } : rejected(raw, body.error);
  }
  const body = reportSchema.safeParse(envelope.data.body);
  return body.success ? { item: { kind: 'REPORT', body: body.data } } : rejected(raw, body.error);
}

// Each item parses into a result rather than failing, so one malformed item is answered
// INVALID on its own instead of failing the whole batch with a 400.
export const syncRequestSchema = z.object({
  items: z.array(z.unknown().transform(parseSyncItem)).min(1).max(MAX_SYNC_ITEMS),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;
