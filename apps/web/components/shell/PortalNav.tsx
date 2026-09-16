'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Match only the exact path instead of the path and everything below it. */
  exact?: boolean;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function BottomNav({ items, className }: { items: readonly NavItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <ul className={cn('mx-auto flex h-16 max-w-screen-sm items-stretch justify-around', className)}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href} className="flex flex-1">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:bg-accent [&_svg]:size-5',
                active && 'text-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SideNav({ items, className }: { items: readonly NavItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <ul className={cn('grid gap-1 p-3', className)}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4',
                active && 'bg-accent text-accent-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
