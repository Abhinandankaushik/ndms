import { Injectable } from '@nestjs/common';
import type { MediaStatus } from '../../common/domain/enums';
import { PrismaService } from '../../infra/database/prisma.service';
import type { MediaRecord } from '../media/media.repository';

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

// Volunteer documents are media rows with purpose VOLUNTEER_DOCUMENT and no incident;
// the uploader is the volunteer they belong to.
@Injectable()
export class VolunteerDocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(document: {
    uploadedBy: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<MediaRecord> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      INSERT INTO media (uploaded_by, purpose, object_key, content_type, size_bytes)
      VALUES (${document.uploadedBy}::uuid, 'VOLUNTEER_DOCUMENT', ${document.objectKey}::text,
              ${document.contentType}::text, ${document.sizeBytes}::bigint)
      RETURNING id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
                status::text AS status, created_at, confirmed_at`;
    return toRecord(rows[0]!);
  }

  async findOwned(id: string, uploadedBy: string): Promise<MediaRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      SELECT id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
             status::text AS status, created_at, confirmed_at
      FROM media
      WHERE id = ${id}::uuid AND uploaded_by = ${uploadedBy}::uuid AND purpose = 'VOLUNTEER_DOCUMENT'`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async confirm(id: string, sizeBytes: number): Promise<MediaRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      UPDATE media SET status = 'CONFIRMED', confirmed_at = now(), size_bytes = ${sizeBytes}::bigint
      WHERE id = ${id}::uuid AND status = 'PENDING' AND purpose = 'VOLUNTEER_DOCUMENT'
      RETURNING id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
                status::text AS status, created_at, confirmed_at`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listConfirmedFor(volunteerIds: readonly string[]): Promise<MediaRecord[]> {
    if (volunteerIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      SELECT id, uploaded_by, incident_id, object_key, content_type, size_bytes::float8 AS size_bytes,
             status::text AS status, created_at, confirmed_at
      FROM media
      WHERE uploaded_by = ANY(${[...volunteerIds]}::uuid[])
        AND purpose = 'VOLUNTEER_DOCUMENT'
        AND status = 'CONFIRMED'
      ORDER BY confirmed_at, id`;
    return rows.map(toRecord);
  }
}
