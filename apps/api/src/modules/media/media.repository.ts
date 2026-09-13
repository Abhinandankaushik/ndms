import { Injectable } from '@nestjs/common';
import type { MediaStatus } from '../../common/domain/enums';
import { PrismaService } from '../../infra/database/prisma.service';

export interface MediaRecord {
  id: string;
  uploadedBy: string;
  incidentId: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  status: MediaStatus;
  createdAt: Date;
  confirmedAt: Date | null;
}

interface MediaRow {
  id: string;
  uploaded_by: string;
  incident_id: string | null;
  object_key: string;
  content_type: string;
  size_bytes: number | null;
  status: MediaStatus;
  created_at: Date;
  confirmed_at: Date | null;
}

const toRecord = (row: MediaRow): MediaRecord => ({
  id: row.id,
  uploadedBy: row.uploaded_by,
  incidentId: row.incident_id,
  objectKey: row.object_key,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  status: row.status,
  createdAt: row.created_at,
  confirmedAt: row.confirmed_at,
});

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(media: {
    uploadedBy: string;
    incidentId: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<MediaRecord> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      INSERT INTO media (uploaded_by, purpose, incident_id, object_key, content_type, size_bytes)
      VALUES (${media.uploadedBy}::uuid, 'INCIDENT_ATTACHMENT', ${media.incidentId}::uuid, ${media.objectKey},
              ${media.contentType}, ${media.sizeBytes}::bigint)
      RETURNING id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
                status::text AS status, created_at, confirmed_at`;
    return toRecord(rows[0]!);
  }

  async findById(id: string): Promise<MediaRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      SELECT id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
             status::text AS status, created_at, confirmed_at
      FROM media WHERE id = ${id}::uuid`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async confirm(id: string, sizeBytes: number): Promise<MediaRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      UPDATE media SET status = 'CONFIRMED', confirmed_at = now(), size_bytes = ${sizeBytes}::bigint
      WHERE id = ${id}::uuid AND status = 'PENDING'
      RETURNING id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
                status::text AS status, created_at, confirmed_at`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listConfirmed(incidentId: string): Promise<MediaRecord[]> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      SELECT id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
             status::text AS status, created_at, confirmed_at
      FROM media
      WHERE incident_id = ${incidentId}::uuid AND status = 'CONFIRMED'
      ORDER BY confirmed_at`;
    return rows.map(toRecord);
  }
}
