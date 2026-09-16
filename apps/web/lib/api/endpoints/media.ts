import { ApiError, apiFetch, NETWORK_ERROR, type CallOptions } from '../client';
import {
  IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  type IncidentMedia,
  type IncidentMediaPresignInput,
  type MediaRecord,
  type PresignedUpload,
} from '../types';

export type UploadProgressHandler = (fractionSent: number) => void;

export function presignIncidentMedia(input: IncidentMediaPresignInput): Promise<PresignedUpload> {
  return apiFetch<PresignedUpload>('/media/presign', { method: 'POST', body: input });
}

export function confirmMedia(mediaId: string): Promise<MediaRecord> {
  return apiFetch<MediaRecord>('/media/confirm', { method: 'POST', body: { mediaId } });
}

export function listIncidentMedia(incidentId: string, options?: CallOptions): Promise<IncidentMedia[]> {
  return apiFetch<IncidentMedia[]>(`/incidents/${encodeURIComponent(incidentId)}/media`, options);
}

// Presign -> direct PUT to object storage -> confirm. The file never passes through the API
// (CLAUDE.md rule 7).
export async function uploadIncidentPhoto(
  incidentId: string,
  file: File,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<MediaRecord> {
  const contentType = assertUploadable(file, IMAGE_CONTENT_TYPES, 'Photos must be JPEG, PNG or WebP.');
  const upload = await presignIncidentMedia({ incidentId, contentType, sizeBytes: file.size });
  await putToPresignedUrl(upload, file, onProgress, signal);
  return confirmMedia(upload.mediaId);
}

// XMLHttpRequest rather than fetch because fetch still cannot report upload progress.
export function putToPresignedUrl(
  upload: PresignedUpload,
  file: Blob,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }

    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanUp = () => signal?.removeEventListener('abort', abort);

    request.open(upload.method, upload.uploadUrl);
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      cleanUp();
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new ApiError(request.status, 'UPLOAD_FAILED', `The upload was refused (HTTP ${request.status}).`));
      }
    };
    request.onerror = () => {
      cleanUp();
      reject(new ApiError(0, NETWORK_ERROR, 'The upload was interrupted. Check your connection and try again.'));
    };
    request.onabort = () => {
      cleanUp();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
}

export function assertUploadable<T extends string>(file: File, allowedTypes: readonly T[], typeMessage: string): T {
  const contentType = allowedTypes.find((type) => type === file.type);
  if (!contentType) {
    throw new ApiError(400, 'VALIDATION_FAILED', typeMessage);
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Files must be smaller than 10 MB.');
  }
  return contentType;
}
