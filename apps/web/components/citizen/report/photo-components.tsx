'use client';

import { CircleAlert, CircleCheck, ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  discardPhotoUpload,
  isAcceptedPhoto,
  retryPhotoUpload,
  type PhotoUpload,
} from './photo-uploads';

export const MAX_PHOTOS_PER_BATCH = 5;
const ACCEPTED_PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

export interface PhotoInputButtonProps {
  label: string;
  remaining: number;
  onSelect: (files: File[]) => void;
  onRejected: (message: string) => void;
  disabled?: boolean;
}

export function PhotoInputButton({ label, remaining, onSelect, onRejected, disabled = false }: PhotoInputButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    const accepted = chosen.filter(isAcceptedPhoto);
    if (accepted.length < chosen.length) onRejected('Only JPEG, PNG or WebP photos can be added.');
    if (accepted.length > remaining) {
      onRejected(`You can add ${remaining} more ${remaining === 1 ? 'photo' : 'photos'}.`);
    }
    const kept = accepted.slice(0, remaining);
    if (kept.length > 0) onSelect(kept);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES}
        multiple
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full text-base"
        disabled={disabled || remaining <= 0}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="size-5" />
        {label}
      </Button>
    </>
  );
}

export interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export function SelectedPhotoGrid({ photos, onRemove }: { photos: readonly SelectedPhoto[]; onRemove: (id: string) => void }) {
  if (photos.length === 0) return null;

  return (
    <ul className="grid grid-cols-3 gap-2">
      {photos.map((photo, index) => (
        <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
          <img src={photo.previewUrl} alt={`Selected photo ${index + 1}`} className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(photo.id)}
            aria-label={`Remove photo ${index + 1}`}
            className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full bg-black/70 text-white outline-none focus-visible:ring-[3px] focus-visible:ring-white"
          >
            <X className="size-5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const STAGE_LABELS: Record<PhotoUpload['stage'], string> = {
  waiting: 'Waiting to upload',
  preparing: 'Making the photo smaller…',
  uploading: 'Uploading',
  done: 'Uploaded',
  failed: 'Upload failed',
};

export function PhotoUploadProgressList({ incidentId, uploads }: { incidentId: string; uploads: readonly PhotoUpload[] }) {
  if (uploads.length === 0) return null;

  return (
    <ul className="grid gap-2" aria-label="Photo uploads">
      {uploads.map((upload, index) => (
        <li key={upload.id} className="flex items-center gap-3 rounded-lg border p-2">
          <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
            {upload.previewUrl && <img src={upload.previewUrl} alt="" className="size-full object-cover" />}
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <StageIcon stage={upload.stage} />
              <span>
                Photo {index + 1}: {STAGE_LABELS[upload.stage]}
                {upload.stage === 'uploading' && ` ${Math.round(upload.fractionSent * 100)}%`}
              </span>
            </p>
            {(upload.stage === 'uploading' || upload.stage === 'preparing') && (
              <Progress
                value={upload.stage === 'uploading' ? upload.fractionSent * 100 : 0}
                aria-label={`Photo ${index + 1} upload progress`}
                className={cn(upload.stage === 'preparing' && 'animate-pulse')}
              />
            )}
            {upload.error && <p className="text-sm text-destructive">{upload.error}</p>}
          </div>
          {upload.stage === 'failed' && (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                onClick={() => retryPhotoUpload(incidentId, upload.id)}
                aria-label={`Retry photo ${index + 1}`}
              >
                <RefreshCw className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={() => discardPhotoUpload(incidentId, upload.id)}
                aria-label={`Discard photo ${index + 1}`}
              >
                <X className="size-5" />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function StageIcon({ stage }: { stage: PhotoUpload['stage'] }) {
  if (stage === 'done') return <CircleCheck aria-hidden className="size-4 text-emerald-700" />;
  if (stage === 'failed') return <CircleAlert aria-hidden className="size-4 text-destructive" />;
  return <LoaderCircle aria-hidden className="size-4 animate-spin" />;
}
