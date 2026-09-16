import { BadRequestException, ConflictException, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth-user';
import type { IncidentsService, ReportReceipt } from '../incidents/incidents.service';
import { parseSyncItem } from './sync.schemas';
import { SyncService } from './sync.service';

const CITIZEN: AuthUser = {
  id: '6f1d7c52-8a0e-4c1b-9a53-2f4f1b0f3a11',
  role: 'CITIZEN',
  districtId: null,
  rescueTeamId: null,
  facilityId: null,
};

const receipt = (id: string, wasInserted: boolean): ReportReceipt => ({
  id,
  districtId: 1,
  status: 'REPORTED',
  reportedAt: new Date(),
  wasInserted,
});

const sosItem = () => ({ kind: 'SOS', body: { clientUuid: randomUUID(), reportedAt: new Date().toISOString() } });
const reportItem = () => ({
  kind: 'REPORT',
  body: { clientUuid: randomUUID(), reportedAt: new Date().toISOString(), type: 'FLOOD' },
});

describe('SyncService', () => {
  let reportSos: jest.Mock<Promise<ReportReceipt>>;
  let reportDetailed: jest.Mock<Promise<ReportReceipt>>;
  let service: SyncService;

  const sync = (...items: unknown[]) => service.syncBatch(items.map(parseSyncItem), CITIZEN);

  beforeEach(() => {
    reportSos = jest.fn();
    reportDetailed = jest.fn();
    service = new SyncService({ reportSos, reportDetailed } as unknown as IncidentsService);
  });

  it('answers every item in request order with its own outcome', async () => {
    const delivered = sosItem();
    const taken = sosItem();
    const refused = reportItem();
    const id = randomUUID();
    reportSos
      .mockResolvedValueOnce(receipt(id, true))
      .mockResolvedValueOnce(receipt(id, false))
      .mockRejectedValueOnce(new ConflictException({ code: 'CLIENT_UUID_CONFLICT', message: 'Taken' }));
    reportDetailed.mockRejectedValueOnce(
      new BadRequestException({ code: 'OUTSIDE_SERVICE_AREA', message: 'Outside the district', details: { lat: 1 } }),
    );

    const { results } = await sync(delivered, delivered, taken, { kind: 'SOS', body: {} }, refused);

    expect(results).toEqual([
      { clientUuid: delivered.body.clientUuid, outcome: 'CREATED', id },
      { clientUuid: delivered.body.clientUuid, outcome: 'DUPLICATE', id },
      { clientUuid: taken.body.clientUuid, outcome: 'CONFLICT', error: { code: 'CLIENT_UUID_CONFLICT', message: 'Taken' } },
      { clientUuid: null, outcome: 'INVALID', error: expect.objectContaining({ code: 'VALIDATION_FAILED' }) },
      {
        clientUuid: refused.body.clientUuid,
        outcome: 'INVALID',
        error: { code: 'OUTSIDE_SERVICE_AREA', message: 'Outside the district', details: { lat: 1 } },
      },
    ]);
    expect(reportDetailed).toHaveBeenCalledWith(expect.objectContaining({ clientUuid: refused.body.clientUuid, type: 'FLOOD' }), CITIZEN);
  });

  it('names a refusal without a code after its HTTP status', async () => {
    reportSos.mockRejectedValueOnce(new HttpException('Gone for good', HttpStatus.GONE));

    const { results } = await sync(sosItem());

    expect(results[0]).toMatchObject({ outcome: 'INVALID', error: { code: 'GONE', message: 'Gone for good' } });
  });

  it.each([
    ['the database fails', new Error('Connection terminated unexpectedly')],
    ['no district is configured', new ServiceUnavailableException({ code: 'NO_DISTRICT', message: 'No district is configured' })],
    ['a refusal is worth retrying', new HttpException({ code: 'SLOW_DOWN', message: 'Later' }, HttpStatus.TOO_MANY_REQUESTS)],
  ])('fails the whole batch when %s, without trying the items after it', async (_case, failure) => {
    reportSos.mockResolvedValueOnce(receipt(randomUUID(), true)).mockRejectedValueOnce(failure);

    await expect(sync(sosItem(), sosItem(), sosItem())).rejects.toBe(failure);
    expect(reportSos).toHaveBeenCalledTimes(2);
  });
});
