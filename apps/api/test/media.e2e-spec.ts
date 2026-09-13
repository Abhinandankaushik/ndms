import { CreateBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { loginAs, type LoggedIn } from './support/auth';
import { MINIO_CREDENTIALS } from './support/containers';
import { createTestApp, startStack, stopStack, TEST_BUCKET, type TestApp, type TestStack } from './support/test-app';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

describe('presigned media uploads', () => {
  let stack: TestStack;
  let t: TestApp;
  let s3: S3Client;
  let citizen: LoggedIn;
  let incidentId: string;

  const presign = (who: LoggedIn, sizeBytes: number, forIncident = incidentId) =>
    t.http().post('/api/v1/media/presign').set(who.auth).send({ incidentId: forIncident, contentType: 'image/png', sizeBytes });

  beforeAll(async () => {
    stack = await startStack({ minio: true });
    t = await createTestApp(stack);
    s3 = new S3Client({
      endpoint: t.env.S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: MINIO_CREDENTIALS.user, secretAccessKey: MINIO_CREDENTIALS.password },
    });
    await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));

    citizen = await loginAs(t);
    const incident = await t
      .http()
      .post('/api/v1/incidents/sos')
      .set(citizen.auth)
      .send({ clientUuid: randomUUID(), lat: 26.1542, lon: 85.8918, reportedAt: new Date().toISOString() })
      .expect(201);
    incidentId = incident.body.data.id;
  });

  afterAll(async () => {
    s3?.destroy();
    await t?.close();
    await stopStack(stack);
  });

  it('uploads straight to object storage, then confirms and lists the image', async () => {
    const grant = await presign(citizen, PNG_BYTES.length).expect(201);

    const upload = await fetch(grant.body.data.uploadUrl, {
      method: 'PUT',
      headers: grant.body.data.headers,
      body: PNG_BYTES,
    });
    expect(upload.status).toBe(200);

    const confirmed = await t.http().post('/api/v1/media/confirm').set(citizen.auth).send({ mediaId: grant.body.data.mediaId }).expect(201);
    expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', sizeBytes: PNG_BYTES.length });

    const listed = await t.http().get(`/api/v1/incidents/${incidentId}/media`).set(citizen.auth).expect(200);
    expect(listed.body.data).toHaveLength(1);
    const download = await fetch(listed.body.data[0].url);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it('refuses to confirm before anything was uploaded', async () => {
    const grant = await presign(citizen, PNG_BYTES.length).expect(201);

    const response = await t.http().post('/api/v1/media/confirm').set(citizen.auth).send({ mediaId: grant.body.data.mediaId }).expect(409);

    expect(response.body.error.code).toBe('MEDIA_NOT_UPLOADED');
  });

  it('deletes an upload larger than the limit instead of confirming it', async () => {
    const grant = await presign(citizen, 1024).expect(201);
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    await fetch(grant.body.data.uploadUrl, { method: 'PUT', headers: grant.body.data.headers, body: oversized });

    const response = await t.http().post('/api/v1/media/confirm').set(citizen.auth).send({ mediaId: grant.body.data.mediaId }).expect(422);

    expect(response.body.error.code).toBe('MEDIA_REJECTED');
    await expect(s3.send(new HeadObjectCommand({ Bucket: TEST_BUCKET, Key: grant.body.data.objectKey }))).rejects.toMatchObject({
      name: 'NotFound',
    });
  });

  it("refuses a presign for someone else's incident", async () => {
    const stranger = await loginAs(t);

    await presign(stranger, PNG_BYTES.length).expect(404);
  });
});
