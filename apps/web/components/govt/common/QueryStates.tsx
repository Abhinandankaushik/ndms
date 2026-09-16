import { CircleAlert, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { describeError } from '../lib/errors';

export function ErrorNotice({
  error,
  title = 'Could not load this',
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{describeError(error)}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
            <RefreshCw />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyNotice({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <Icon aria-hidden className="size-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('grid gap-3 p-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
