'use client';

import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Panel } from '@/components/citizen/common/page';
import {
  MAX_PHOTOS_PER_BATCH,
  PhotoInputButton,
  PhotoUploadProgressList,
} from '@/components/citizen/report/photo-components';
import { queuePhotoUploads, usePhotoUploads } from '@/components/citizen/report/photo-uploads';
import { Skeleton } from '@/components/ui/skeleton';
import { listIncidentMedia } from '@/lib/api/endpoints/media';
import { queryKeys } from '@/lib/api/query-keys';
import type { IncidentMedia } from '@/lib/api/types';

// Photo links are presigned for 15 minutes; re-reading them well inside that keeps new thumbnails loadable.
const MEDIA_STALE_MS = 5 * 60_000;

export function IncidentPhotosCard({ incidentId, canAdd }: { incidentId: string; canAdd: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const uploads = usePhotoUploads(incidentId);
  const media = useQuery({
    queryKey: queryKeys.incidents.media(incidentId),
    queryFn: ({ signal }) => listIncidentMedia(incidentId, { signal }),
    staleTime: MEDIA_STALE_MS,
  });

  const inFlight = uploads.filter((upload) => upload.stage !== 'done');
  const photos = media.data ?? [];
  if (!canAdd && photos.length === 0 && inFlight.length === 0) return null;

  return (
    <Panel title="Photos">
      {media.isPending ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <PhotoThumbnail photo={photo} label={`Photo ${index + 1}`} />
            </li>
          ))}
        </ul>
      ) : (
        inFlight.length === 0 && (
          <p className="text-base text-foreground/80">
            {media.isError ? 'Photos could not be loaded right now.' : 'No photos yet. A photo helps responders judge the situation.'}
          </p>
        )
      )}
      <PhotoUploadProgressList incidentId={incidentId} uploads={inFlight} />
      {canAdd && (
        <PhotoInputButton
          label="Add photos"
          remaining={MAX_PHOTOS_PER_BATCH - inFlight.length}
          onSelect={(files) => {
            setNotice(null);
            queuePhotoUploads(incidentId, files);
          }}
          onRejected={setNotice}
        />
      )}
      {notice && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {notice}
        </p>
      )}
    </Panel>
  );
}

function PhotoThumbnail({ photo, label }: { photo: IncidentMedia; label: string }) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border bg-muted p-1 text-center text-xs">
        <ImageOff aria-hidden className="size-5" />
        {label} unavailable
      </div>
    );
  }

  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block aspect-square overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <img
        src={photo.url}
        alt={label}
        loading="lazy"
        className="size-full object-cover"
        onError={() => setHasFailed(true)}
      />
    </a>
  );
}
