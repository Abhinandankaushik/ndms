import { Navigation, Phone } from 'lucide-react';
import { directionsUrl, telHref } from '@/components/citizen/common/directions';
import { formatCount, formatDistance, formatRelativeTime } from '@/components/citizen/common/format';
import { Button } from '@/components/ui/button';
import type { NearbyFacility } from '@/lib/api/types';
import { cn } from '@/lib/utils';

// Shelters at 85 % or more are flagged to officials as nearly full (contract: facility:capacity_alert).
export const NEARLY_FULL_UTILISATION = 0.85;

export function ShelterCard({ shelter, now, distanceFrom }: { shelter: NearbyFacility; now: number; distanceFrom: string }) {
  const isNearlyFull = shelter.utilisation >= NEARLY_FULL_UTILISATION;
  const percentFull = Math.min(100, Math.round(shelter.utilisation * 100));

  return (
    <article className="grid gap-3 rounded-xl border-2 bg-card p-4" aria-label={shelter.name}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg leading-snug font-bold break-words">{shelter.name}</h3>
        <p className="shrink-0 text-right text-base font-bold">
          {formatDistance(shelter.distanceM)}
          <span className="block text-xs font-normal text-foreground/70">{distanceFrom}</span>
        </p>
      </div>

      <div className="grid gap-1.5">
        <p className={cn('text-base font-semibold', isNearlyFull ? 'text-amber-800' : 'text-emerald-800')}>
          Space for {formatCount(shelter.freeCapacity)} more {shelter.freeCapacity === 1 ? 'person' : 'people'}
          <span className="font-normal text-foreground/75"> · {formatCount(shelter.capacity)} places in total</span>
        </p>
        <div
          role="meter"
          aria-label="How full the shelter is"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentFull}
          aria-valuetext={`${percentFull}% full`}
          className="h-3 overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className={cn('h-full rounded-full', isNearlyFull ? 'bg-amber-600' : 'bg-emerald-600')}
            style={{ width: `${percentFull}%` }}
          />
        </div>
        <p className="text-sm text-foreground/75">
          {percentFull}% full{isNearlyFull && ' · filling up'} · updated {formatRelativeTime(shelter.updatedAt, now)}
        </p>
      </div>

      {shelter.address && <p className="text-base break-words">{shelter.address}</p>}
      {shelter.amenities.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Facilities">
          {shelter.amenities.map((amenity) => (
            <li key={amenity} className="rounded-md bg-foreground/10 px-2 py-0.5 text-sm">
              {humanise(amenity)}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('grid gap-2', shelter.contactPhone && 'grid-cols-2')}>
        {shelter.contactPhone && (
          <Button asChild size="xl" variant="outline">
            <a href={telHref(shelter.contactPhone)} aria-label={`Call ${shelter.name}`}>
              <Phone />
              Call
            </a>
          </Button>
        )}
        <Button asChild size="xl">
          <a
            href={directionsUrl(shelter)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${shelter.name} (opens Google Maps)`}
          >
            <Navigation />
            Directions
          </a>
        </Button>
      </div>
    </article>
  );
}

function humanise(amenity: string): string {
  const spaced = amenity.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
