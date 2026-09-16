import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type HeadObjectCommandOutput,
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
import { ENV, type Env } from '../../config/env';
import { S3, S3_PUBLIC } from '../../infra/storage/storage.module';
import type { AuthUser } from '../auth/auth-user';
import type { MediaRecord } from '../media/media.repository';
import { VolunteerDocumentsRepository } from './volunteer-documents.repository';
import { volunteerNotFound } from './volunteers.errors';
import { VolunteersRepository } from './volunteers.repository';
import { MAX_DOCUMENT_BYTES, type DocumentContentType, type PresignDocumentInput } from './volunteers.schemas';

const EXTENSIONS: Record<DocumentContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const URL_TTL_SECONDS = 900;

export interface DocumentLink {
  id: string;
  contentType: string;
  sizeBytes: number | null;
  confirmedAt: Date | null;
  url: string;
  expiresInSeconds: number;
}

const mediaNotFound = () => new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media not found' });

@Injectable()
export class VolunteerDocumentsService {
  constructor(
    private readonly documents: VolunteerDocumentsRepository,
    private readonly volunteers: VolunteersRepository,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(S3_PUBLIC) private readonly s3Public: S3Client,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async presign(input: PresignDocumentInput, user: AuthUser) {
    if (!(await this.volunteers.findByUser(user.id))) throw volunteerNotFound();

    const objectKey = `volunteers/${user.id}/${randomUUID()}.${EXTENSIONS[input.contentType]}`;
    const record = await this.documents.createPending({
      uploadedBy: user.id,
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

  // The declared size is only a hint, so the stored object is checked before the record is
  // trusted. An empty object is refused too: media.size_bytes must be positive.
  async confirm(mediaId: string, user: AuthUser): Promise<MediaRecord> {
    const record = await this.documents.findOwned(mediaId, user.id);
    if (!record) throw mediaNotFound();
    if (record.status === 'CONFIRMED') return record;

    const head = await this.headObject(record.objectKey);
    if (!head) {
      throw new ConflictException({ code: 'MEDIA_NOT_UPLOADED', message: 'Upload the file before confirming' });
    }

    const size = head.ContentLength ?? 0;
    if (size <= 0 || size > MAX_DOCUMENT_BYTES || head.ContentType !== record.contentType) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: record.objectKey }));
      throw new UnprocessableEntityException({
        code: 'MEDIA_REJECTED',
        message: `Documents must be non-empty ${record.contentType} files of at most ${MAX_DOCUMENT_BYTES} bytes`,
      });
    }

    return (await this.documents.confirm(mediaId, size)) ?? (await this.documents.findOwned(mediaId, user.id))!;
  }

  async linksByVolunteer(volunteerIds: readonly string[]): Promise<Map<string, DocumentLink[]>> {
    const records = await this.documents.listConfirmedFor(volunteerIds);
    const links = new Map<string, DocumentLink[]>();
    for (const record of records) {
      const link: DocumentLink = {
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
      };
      links.set(record.uploadedBy, [...(links.get(record.uploadedBy) ?? []), link]);
    }
    return links;
  }

  private headObject(objectKey: string): Promise<HeadObjectCommandOutput | null> {
    return this.s3
      .send(new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey }))
      .catch((error: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      });
  }
}
