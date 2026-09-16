'use client';

import { Phone, RotateCw, UserRound } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPhoneForDisplay } from '@/lib/phone';
import type { MissionView } from './mission-cache';
import { isOpenMission } from './mission-flow';

export interface VictimContactProps {
  mission: MissionView;
  loadFailed: boolean;
  onRetry: () => void;
}

export function VictimContact({ mission, loadFailed, onRetry }: VictimContactProps) {
  if (!isOpenMission(mission.status)) {
    return (
      <ContactPanel>
        <p className="text-base font-medium">Contact details are hidden once a mission is closed.</p>
      </ContactPanel>
    );
  }

  if (!mission.contactLoaded) {
    return loadFailed ? (
      <ContactPanel>
        <p role="alert" className="text-base font-bold text-red-700">
          Could not load the contact details.
        </p>
        <Button type="button" variant="outline" className="h-14 w-full border-2 border-slate-900 text-base font-bold" onClick={onRetry}>
          <RotateCw aria-hidden className="size-5" />
          Try again
        </Button>
      </ContactPanel>
    ) : (
      <ContactPanel>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
      </ContactPanel>
    );
  }

  if (!mission.reporter) {
    return (
      <ContactPanel>
        <p className="text-base font-medium">No contact details are on record for this report.</p>
      </ContactPanel>
    );
  }

  const { fullName, phone } = mission.reporter;
  return (
    <ContactPanel>
      <p className="flex items-center gap-2 text-xl font-bold">
        <UserRound aria-hidden className="size-6 shrink-0" />
        {fullName ?? 'Name not given'}
      </p>
      <Button asChild className="h-16 w-full bg-emerald-700 text-lg font-bold text-white hover:bg-emerald-800">
        <a href={`tel:${phone}`}>
          <Phone aria-hidden className="size-6" />
          Call {formatPhoneForDisplay(phone)}
        </a>
      </Button>
      <p className="text-sm font-medium text-slate-700">
        Shown only to your team while the mission is open. Every view is logged.
      </p>
    </ContactPanel>
  );
}

function ContactPanel({ children }: { children: ReactNode }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid gap-3 rounded-xl border-2 border-slate-900 p-4">
      <h2 id={headingId} className="text-lg font-bold">
        Victim contact <span className="text-sm font-medium text-slate-700">(the person who reported)</span>
      </h2>
      {children}
    </section>
  );
}
