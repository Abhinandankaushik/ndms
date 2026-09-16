'use client';

import { ChevronRight, ClipboardPlus, HandHeart, Phone, PhoneCall, Tent, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CitizenPage, OfflineNotice } from '@/components/citizen/common/page';
import { ActiveRequests } from '@/components/citizen/incidents/ActiveRequests';
import { SosPanel } from '@/components/citizen/sos/SosPanel';
import { cn } from '@/lib/utils';

interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  isCall?: boolean;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { href: 'tel:112', label: 'Call 112', icon: PhoneCall, isCall: true },
  { href: '/citizen/report', label: 'Report with details', icon: ClipboardPlus },
  { href: '/citizen/shelters', label: 'Find a shelter', icon: Tent },
  { href: '/citizen/contacts', label: 'Helplines', icon: Phone },
];

const QUICK_ACTION_CLASS =
  'flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 text-base font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function CitizenHome() {
  return (
    <CitizenPage className="gap-6">
      <OfflineNotice>An SOS needs a connection to reach NDMS. Calls to 112 work without mobile data.</OfflineNotice>
      <SosPanel />
      <nav aria-label="Quick actions">
        <ul className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, isCall }) => (
            <li key={href}>
              {isCall ? (
                <a href={href} className={cn(QUICK_ACTION_CLASS, 'border-red-700 text-red-800 hover:bg-red-50')}>
                  <Icon aria-hidden className="size-6 shrink-0" />
                  {label}
                </a>
              ) : (
                <Link href={href} className={cn(QUICK_ACTION_CLASS, 'bg-card hover:bg-accent')}>
                  <Icon aria-hidden className="size-6 shrink-0" />
                  {label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <ActiveRequests />
      <Link
        href="/citizen/volunteer"
        className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-dashed px-4 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <HandHeart aria-hidden className="size-6 shrink-0" />
        <span className="grid flex-1">
          <span className="text-base font-semibold">Want to help others?</span>
          <span className="text-sm text-foreground/75">Register as a volunteer</span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground/60" />
      </Link>
    </CitizenPage>
  );
}
