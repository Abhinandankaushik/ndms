'use client';

import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { describeError } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { incidentMediaQuery } from '../queries';

export function IncidentPhotos({ incidentId }: { incidentId: string }) {
  const { data, isPending, error } = useQuery(incidentMediaQuery(incidentId));

  if (isPending) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="aspect-square" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">Photos could not be loaded: {describeError(error)}</p>;
  if (data.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff aria-hidden className="size-4" />
        No photos were attached.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-2">
      {data.map((photo, index) => (
        <li key={photo.id}>
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {/* A plain img: presigned storage URLs change on every fetch, so next/image could neither cache nor optimise them. */}
            <img
              src={photo.url}
              alt={`Photo ${index + 1} of ${data.length}${photo.confirmedAt ? `, uploaded ${formatDateTime(photo.confirmedAt)}` : ''}`}
              loading="lazy"
              className="aspect-square w-full bg-muted object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
