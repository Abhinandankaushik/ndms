import { apiFetch, type CallOptions } from '../client';
import {
  VOLUNTEER_DOCUMENT_CONTENT_TYPES,
  type MediaRecord,
  type PresignedUpload,
  type VolunteerApplication,
  type VolunteerApplicationsQuery,
  type VolunteerDocumentPresignInput,
  type VolunteerProfile,
  type VolunteerProfilePatch,
  type VolunteerRegistration,
  type VolunteerReviewDecision,
} from '../types';
import { assertUploadable, putToPresignedUrl, type UploadProgressHandler } from './media';

export function registerVolunteer(registration: VolunteerRegistration): Promise<VolunteerProfile> {
  return apiFetch<VolunteerProfile>('/volunteers/register', { method: 'POST', body: registration });
}

export function getMyVolunteerProfile(options?: CallOptions): Promise<VolunteerProfile> {
  return apiFetch<VolunteerProfile>('/volunteers/me', options);
}

export function updateMyVolunteerProfile(patch: VolunteerProfilePatch): Promise<VolunteerProfile> {
  return apiFetch<VolunteerProfile>('/volunteers/me', { method: 'PATCH', body: patch });
}

export function presignVolunteerDocument(input: VolunteerDocumentPresignInput): Promise<PresignedUpload> {
  return apiFetch<PresignedUpload>('/volunteers/me/documents/presign', { method: 'POST', body: input });
}

export function confirmVolunteerDocument(mediaId: string): Promise<MediaRecord> {
  return apiFetch<MediaRecord>('/volunteers/me/documents/confirm', { method: 'POST', body: { mediaId } });
}

export async function uploadVolunteerDocument(
  file: File,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<MediaRecord> {
  const contentType = assertUploadable(
    file,
    VOLUNTEER_DOCUMENT_CONTENT_TYPES,
    'Documents must be a JPEG, PNG or WebP photo, or a PDF.',
  );
  const upload = await presignVolunteerDocument({ contentType, sizeBytes: file.size });
  await putToPresignedUrl(upload, file, onProgress, signal);
  return confirmVolunteerDocument(upload.mediaId);
}

export function listVolunteerApplications(
  query: VolunteerApplicationsQuery = {},
  options?: CallOptions,
): Promise<VolunteerApplication[]> {
  return apiFetch<VolunteerApplication[]>('/volunteers', {
    ...options,
    query: { status: query.status, limit: query.limit },
  });
}

export function reviewVolunteer(userId: string, decision: VolunteerReviewDecision): Promise<VolunteerProfile> {
  return apiFetch<VolunteerProfile>(`/volunteers/${encodeURIComponent(userId)}/review`, {
    method: 'POST',
    body: decision,
  });
}
