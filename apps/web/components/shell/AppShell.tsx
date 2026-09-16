'use client';

import { Menu, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { homePathForRole, useSessionUser } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { SocketStatusIndicator } from './SocketStatusIndicator';
import { UserMenu } from './UserMenu';

export interface AppShellProps {
  /** Shown next to the app name, e.g. "Control room". */
  portalName: string;
  children: ReactNode;
  /** Mobile-first portals: a fixed bar at the bottom of the screen (see BottomNav). */
  bottomNav?: ReactNode;
  /** Desktop portals: a persistent sidebar on large screens and a slide-out sheet below that (see SideNav). */
  sideNav?: ReactNode;
  /** Page-level controls rendered in the header before the status and account controls. */
  headerActions?: ReactNode;
  className?: string;
}

export function AppShell({ portalName, children, bottomNav, sideNav, headerActions, className }: AppShellProps) {
  const user = useSessionUser();

  return (
    <div className={cn('flex min-h-dvh flex-col bg-background', className)}>
      <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          {sideNav && <MobileSideNav portalName={portalName}>{sideNav}</MobileSideNav>}
          <Link
            href={user ? homePathForRole(user.role) : '/'}
            className="flex items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ShieldAlert aria-hidden className="size-5 text-destructive" />
            <span>NDMS</span>
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{portalName}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {headerActions}
            <SocketStatusIndicator />
            {user && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {ROLE_LABELS[user.role]}
              </Badge>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sideNav && (
          <aside className="hidden w-60 shrink-0 border-r lg:block">
            <nav aria-label={`${portalName} navigation`} className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
              {sideNav}
            </nav>
          </aside>
        )}
        <main className={cn('flex min-w-0 flex-1 flex-col', bottomNav && 'pb-[calc(4rem+env(safe-area-inset-bottom))]')}>
          {children}
        </main>
      </div>

      {bottomNav && (
        <nav
          aria-label={`${portalName} navigation`}
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
        >
          {bottomNav}
        </nav>
      )}
    </div>
  );
}

function MobileSideNav({ portalName, children }: { portalName: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const closeAfterNavigation = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>NDMS</SheetTitle>
          <SheetDescription>{portalName}</SheetDescription>
        </SheetHeader>
        <nav aria-label={`${portalName} navigation`} onClick={closeAfterNavigation}>
          {children}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
