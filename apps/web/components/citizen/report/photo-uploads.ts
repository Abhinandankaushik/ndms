import { create } from 'zustand';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { ApiError } from '@/lib/api/api-error';
import { uploadIncidentPhoto } from '@/lib/api/endpoints/media';
import { queryKeys } from '@/lib/api/query-keys';
import { IMAGE_CONTENT_TYPES } from '@/lib/api/types';
import { createClientUuid } from '@/lib/client-uuid';
import { getQueryClient } from '@/lib/query/query-client';
import { compressImage, INCIDENT_PHOTO_TARGET } from './compress-image';

export type PhotoUploadStage = 'waiting' | 'preparing' | 'uploading' | 'done' | 'failed';

export interface PhotoUpload {
  id: string;
  fileName: string;
  previewUrl: string | null;
  stage: PhotoUploadStage;
  fractionSent: number;
  error: string | null;
}

const NO_UPLOADS: readonly PhotoUpload[] = [];

// Uploads live outside any screen: the report screen starts them and moves on to the confirmation, which keeps
// showing their progress.
const usePhotoUploadStore = create<{ byIncident: Record<string, readonly PhotoUpload[]> }>()(() => ({
  byIncident: {},
}));

const pendingFiles = new Map<string, File>();
const uploadChains = new Map<string, Promise<void>>();

export function usePhotoUploads(incidentId: string): readonly PhotoUpload[] {
  return usePhotoUploadStore((state) => state.byIncident[incidentId] ?? NO_UPLOADS);
}

export function isAcceptedPhoto(file: File): boolean {
  return IMAGE_CONTENT_TYPES.some((type) => type === file.type);
}

export function queuePhotoUploads(incidentId: string, files: readonly File[]): void {
  const uploads = files.map((file): PhotoUpload => {
    const id = createClientUuid();
    pendingFiles.set(id, file);
    return {
      id,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      stage: 'waiting',
      fractionSent: 0,
      error: null,
    };
  });
  updateUploads(incidentId, (current) => [...current, ...uploads]);
  for (const upload of uploads) enqueue(incidentId, upload.id);
}

export function retryPhotoUpload(incidentId: string, uploadId: string): void {
  const upload = findUpload(incidentId, uploadId);
  if (upload?.stage !== 'failed' || !pendingFiles.has(uploadId)) return;
  patchUpload(incidentId, uploadId, { stage: 'waiting', fractionSent: 0, error: null });
  enqueue(incidentId, uploadId);
}

export function discardPhotoUpload(incidentId: string, uploadId: string): void {
  const upload = findUpload(incidentId, uploadId);
  if (!upload || upload.stage === 'preparing' || upload.stage === 'uploading') return;
  releaseFile(upload);
  updateUploads(incidentId, (current) => current.filter((candidate) => candidate.id !== uploadId));
}

// One photo at a time per report: on a weak network parallel uploads compete and all of them stall.
function enqueue(incidentId: string, uploadId: string): void {
  const previous = uploadChains.get(incidentId) ?? Promise.resolve();
  const next = previous.then(() => runUpload(incidentId, uploadId));
  uploadChains.set(incidentId, next);
  void next.finally(() => {
    if (uploadChains.get(incidentId) === next) uploadChains.delete(incidentId);
  });
}

async function runUpload(incidentId: string, uploadId: string): Promise<void> {
  const file = pendingFiles.get(uploadId);
  if (!file || findUpload(incidentId, uploadId)?.stage !== 'waiting') return;

  try {
    patchUpload(incidentId, uploadId, { stage: 'preparing' });
    const compressed = await compressImage(file, INCIDENT_PHOTO_TARGET).catch(() => {
      throw new PhotoPreparationError();
    });
    patchUpload(incidentId, uploadId, { stage: 'uploading', fractionSent: 0 });
    await uploadIncidentPhoto(incidentId, compressed, (fraction) => reportProgress(incidentId, uploadId, fraction));
    const upload = findUpload(incidentId, uploadId);
    if (upload) releaseFile(upload);
    patchUpload(incidentId, uploadId, { stage: 'done', fractionSent: 1, previewUrl: null });
    void getQueryClient().invalidateQueries({ queryKey: queryKeys.incidents.media(incidentId) });
  } catch (error) {
    patchUpload(incidentId, uploadId, { stage: 'failed', error: describePhotoError(error) });
  }
}

class PhotoPreparationError extends Error {}

function describePhotoError(error: unknown): string {
  if (error instanceof PhotoPreparationError) return 'This photo could not be read. Try a different one.';
  if (error instanceof ApiError && error.code === 'MEDIA_REJECTED') return 'The server did not accept this photo.';
  if (error instanceof ApiError && error.code === 'INCIDENT_NOT_FOUND') return 'This report is no longer available.';
  return describeApiError(error, 'The photo could not be uploaded.');
}

function reportProgress(incidentId: string, uploadId: string, fraction: number): void {
  const upload = findUpload(incidentId, uploadId);
  const rounded = Math.floor(fraction * 100) / 100;
  if (upload && rounded !== upload.fractionSent) patchUpload(incidentId, uploadId, { fractionSent: rounded });
}

function releaseFile(upload: PhotoUpload): void {
  pendingFiles.delete(upload.id);
  if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
}

function findUpload(incidentId: string, uploadId: string): PhotoUpload | undefined {
  return usePhotoUploadStore.getState().byIncident[incidentId]?.find((upload) => upload.id === uploadId);
}

function patchUpload(incidentId: string, uploadId: string, changes: Partial<PhotoUpload>): void {
  updateUploads(incidentId, (current) =>
    current.map((upload) => (upload.id === uploadId ? { ...upload, ...changes } : upload)),
  );
}

function updateUploads(
  incidentId: string,
  change: (current: readonly PhotoUpload[]) => readonly PhotoUpload[],
): void {
  usePhotoUploadStore.setState((state) => ({
    byIncident: { ...state.byIncident, [incidentId]: change(state.byIncident[incidentId] ?? NO_UPLOADS) },
  }));
}
