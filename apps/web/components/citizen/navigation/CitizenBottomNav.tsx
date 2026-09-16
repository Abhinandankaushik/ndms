'use client';

import {
  BellRing,
  ChevronRight,
  ClipboardList,
  ClipboardPlus,
  Ellipsis,
  HandHeart,
  Phone,
  Siren,
  Tent,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

const PRIMARY_DESTINATIONS: readonly Destination[] = [
  { href: '/citizen', label: 'SOS', icon: Siren, isActive: (pathname) => pathname === '/citizen' },
  {
    href: '/citizen/incidents',
    label: 'Reports',
    icon: ClipboardList,
    isActive: (pathname) => within(pathname, '/citizen/incidents') || within(pathname, '/citizen/report'),
  },
  { href: '/citizen/shelters', label: 'Shelters', icon: Tent, isActive: (pathname) => within(pathname, '/citizen/shelters') },
  { href: '/citizen/alerts', label: 'Alerts', icon: BellRing, isActive: (pathname) => within(pathname, '/citizen/alerts') },
];

interface MoreDestination {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MORE_DESTINATIONS: readonly MoreDestination[] = [
  { href: '/citizen/contacts', label: 'Emergency helplines', description: '112, ambulance, fire and control rooms', icon: Phone },
  { href: '/citizen/report', label: 'Report an incident', description: 'Send details and photos', icon: ClipboardPlus },
  { href: '/citizen/volunteer', label: 'Volunteer', description: 'Apply, get verified and take tasks', icon: HandHeart },
];

const ITEM_CLASS =
  'relative flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium outline-none transition-colors focus-visible:bg-accent [&_svg]:size-6';
const ACTIVE_MARKER_CLASS = 'absolute inset-x-3 top-0 h-1 rounded-b-full bg-foreground';

export function CitizenBottomNav() {
  const pathname = usePathname();
  const [isMoreOpen, setMoreOpen] = useState(false);
  const isMoreActive = MORE_DESTINATIONS.some(
    ({ href }) => within(pathname, href) && !PRIMARY_DESTINATIONS.some((destination) => destination.isActive(pathname)),
  );

  return (
    <ul className="mx-auto flex h-16 max-w-screen-sm items-stretch">
      {PRIMARY_DESTINATIONS.map(({ href, label, icon: Icon, isActive }) => {
        const active = isActive(pathname);
        return (
          <li key={href} className="flex flex-1">
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(ITEM_CLASS, active ? 'font-bold text-foreground' : 'text-foreground/70')}
            >
              {active && <span aria-hidden className={ACTIVE_MARKER_CLASS} />}
              <Icon aria-hidden className={cn(href === '/citizen' && 'text-red-600')} />
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
      <li className="flex flex-1">
        <Sheet open={isMoreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(ITEM_CLASS, isMoreActive ? 'font-bold text-foreground' : 'text-foreground/70')}
            >
              {isMoreActive && <span aria-hidden className={ACTIVE_MARKER_CLASS} />}
              <Ellipsis aria-hidden />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-w-screen-sm gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]">
            <SheetHeader className="border-b pr-12">
              <SheetTitle className="text-lg">More</SheetTitle>
              <SheetDescription className="sr-only">Other citizen screens</SheetDescription>
            </SheetHeader>
            <ul className="grid p-2">
              {MORE_DESTINATIONS.map(({ href, label, description, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={within(pathname, href) ? 'page' : undefined}
                    className="flex min-h-16 items-center gap-4 rounded-lg px-3 outline-none hover:bg-accent focus-visible:bg-accent aria-[current=page]:bg-accent"
                  >
                    <Icon aria-hidden className="size-6 shrink-0" />
                    <span className="grid min-w-0 flex-1">
                      <span className="text-base font-semibold">{label}</span>
                      <span className="text-sm text-foreground/75">{description}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground/60" />
                  </Link>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </li>
    </ul>
  );
}
