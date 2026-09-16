'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { Building2, CircleAlert, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FacilityDetail } from '@/lib/api/types';
import { FACILITY_KIND_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { describeApiError, isApiStatus } from './describe-error';
import { useMyFacility } from './facility-sync';

export function ScreenContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('mx-auto grid w-full max-w-screen-md content-start gap-4 px-4 py-4 sm:gap-6 sm:py-6', className)}>
      {children}
    </section>
  );
}

export interface FacilityScreenProps {
  title?: string;
  description?: string;
  children: (facility: FacilityDetail) => ReactNode;
}

export function FacilityScreen({ title, description, children }: FacilityScreenProps) {
  const query = useMyFacility();

  return (
    <ScreenContainer>
      {query.data ? (
        <>
          <FacilityHeading facility={query.data} title={title} description={description} />
          {children(query.data)}
        </>
      ) : (
        <FacilityLoadState query={query} />
      )}
    </ScreenContainer>
  );
}

function FacilityHeading({ facility, title, description }: { facility: FacilityDetail; title?: string; description?: string }) {
  return (
    <header className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{FACILITY_KIND_LABELS[facility.kind]}</Badge>
        {!facility.isOperational && <Badge variant="destructive">Not operational</Badge>}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title ?? facility.name}</h1>
      <p className="text-sm text-muted-foreground">
        {title ? facility.name : (facility.address ?? 'No address on record')}
        {description && <span className="block">{description}</span>}
      </p>
    </header>
  );
}

function FacilityLoadState({ query }: { query: UseQueryResult<FacilityDetail> }) {
  if (query.isPending && query.fetchStatus !== 'paused') return <FacilitySkeleton />;

  if (query.isPending) {
    return (
      <Alert>
        <WifiOff />
        <AlertTitle>You are offline</AlertTitle>
        <AlertDescription>Your facility loads as soon as the connection returns.</AlertDescription>
      </Alert>
    );
  }

  if (isApiStatus(query.error, 404)) {
    return (
      <Card>
        <CardContent className="grid justify-items-center gap-3 py-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Building2 aria-hidden className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">No facility is linked to your account</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Ask the district control room to assign you to your shelter or hospital, then sign out and back in.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Could not load your facility</AlertTitle>
      <AlertDescription>
        <p>{describeApiError(query.error)}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function FacilitySkeleton() {
  return (
    <div role="status" aria-label="Loading your facility" className="grid gap-4">
      <div className="grid gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
