'use client';

import { ArrowLeft, CircleAlert, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useIsOnline } from './hooks';

export function CitizenPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto grid w-full max-w-screen-sm min-w-0 content-start gap-5 px-4 py-5', className)}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-base text-foreground/80">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-base font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft aria-hidden className="size-5" />
      {children}
    </Link>
  );
}

export function SectionHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-lg font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export interface PanelProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, action, children, className }: PanelProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn('grid min-w-0 gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs', className)}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <SectionHeading id={headingId}>{title}</SectionHeading>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LoadingBlocks({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorPanel({ title, message, onRetry, isRetrying = false }: ErrorPanelProps) {
  return (
    <Alert variant="destructive" className="border-destructive/50">
      <CircleAlert />
      <AlertTitle className="line-clamp-none text-base">{title}</AlertTitle>
      <AlertDescription className="text-base text-foreground">
        <p>{message}</p>
        {onRetry && (
          <Button type="button" variant="outline" className="mt-2 h-11" onClick={onRetry} disabled={isRetrying}>
            <RefreshCw className={cn(isRetrying && 'animate-spin')} />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function OfflineNotice({ children }: { children: ReactNode }) {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <Alert variant="warning">
      <WifiOff />
      <AlertTitle className="line-clamp-none text-base">You are offline</AlertTitle>
      <AlertDescription className="text-base">{children}</AlertDescription>
    </Alert>
  );
}
