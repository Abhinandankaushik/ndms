import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import { ENV, type Env } from '../../config/env';
import { S3, S3_PUBLIC } from '../../infra/storage/storage.module';
import type { AuthUser } from '../auth/auth-user';
import { IncidentsService } from '../incidents/incidents.service';
import { MediaRepository, type MediaRecord } from './media.repository';

export const ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const URL_TTL_SECONDS = 900;

const mediaNotFound = () => new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media not found' });

@Injectable()
export class MediaService {
  constructor(
    private readonly media: MediaRepository,
    private readonly incidents: IncidentsService,
    private readonly events: DomainEventBus,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(S3_PUBLIC) private readonly s3Public: S3Client,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async presign(input: { incidentId: string; contentType: AllowedImageType; sizeBytes: number }, user: AuthUser) {
    await this.incidents.findVisible(input.incidentId, user);

    const objectKey = `incidents/${input.incidentId}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[input.contentType]}`;
    const record = await this.media.createPending({
      uploadedBy: user.id,
      incidentId: input.incidentId,
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(
      this.s3Public,
      new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey, ContentType: input.contentType }),
      { expiresIn: URL_TTL_SECONDS },
    );

    return {
      mediaId: record.id,
      objectKey,
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.contentType },
      expiresInSeconds: URL_TTL_SECONDS,
    };
  }

  // The declared size and type are only a hint; the stored object is checked before the
  // record is trusted, and anything oversized is deleted.
  async confirm(mediaId: string, user: AuthUser): Promise<MediaRecord> {
    const record = await this.media.findById(mediaId);
    if (!record || record.uploadedBy !== user.id) throw mediaNotFound();
    if (record.status === 'CONFIRMED') return record;

    const head = await this.s3
      .send(new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: record.objectKey }))
      .catch((error: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      });
    if (!head) {
      throw new ConflictException({ code: 'MEDIA_NOT_UPLOADED', message: 'Upload the file before confirming' });
    }

    const size = head.ContentLength ?? 0;
    if (size > MAX_UPLOAD_BYTES || head.ContentType !== record.contentType) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: record.objectKey }));
      throw new UnprocessableEntityException({
        code: 'MEDIA_REJECTED',
        message: `Uploads must be ${record.contentType} and at most ${MAX_UPLOAD_BYTES} bytes`,
      });
    }

    const confirmed = (await this.media.confirm(mediaId, size)) ?? (await this.media.findById(mediaId))!;
    if (confirmed.incidentId) {
      const incident = await this.incidents.findVisible(confirmed.incidentId, user);
      this.events.publish({
        name: 'incident:media_added',
        rooms: [rooms.district(incident.districtId), rooms.incident(incident.id)],
        payload: { incidentId: incident.id, mediaId: confirmed.id, contentType: confirmed.contentType },
      });
    }
    return confirmed;
  }

  async listForIncident(incidentId: string, user: AuthUser) {
    await this.incidents.findVisible(incidentId, user);
    const records = await this.media.listConfirmed(incidentId);
    return Promise.all(
      records.map(async (record) => ({
        id: record.id,
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
        confirmedAt: record.confirmedAt,
        url: await getSignedUrl(
          this.s3Public,
          new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: record.objectKey }),
          { expiresIn: URL_TTL_SECONDS },
        ),
        expiresInSeconds: URL_TTL_SECONDS,
      })),
    );
  }
}
