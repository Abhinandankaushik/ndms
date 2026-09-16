'use client';

import { CircleUser, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout, useSessionUser } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/labels';

export function UserMenu() {
  const router = useRouter();
  const user = useSessionUser();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await logout();
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <CircleUser className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {user && (
          <>
            <DropdownMenuLabel className="grid gap-0.5">
              <span className="truncate">{user.fullName ?? user.phone}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user.fullName ? `${user.phone} · ` : ''}
                {ROLE_LABELS[user.role]}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem variant="destructive" disabled={isSigningOut} onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
