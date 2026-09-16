'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandHelping, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { reviewVolunteer } from '@/lib/api/endpoints/volunteers';
import type { VerificationStatus, VolunteerApplication, VolunteerReviewDecision } from '@/lib/api/types';
import { VERIFICATION_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PageContainer, PageHeader } from '../common/PageHeader';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { hasErrorCode } from '../lib/errors';
import { useNow } from '../lib/useNow';
import { rememberVolunteerDecision } from '../realtime/cache-sync';
import { volunteerApplicationsQuery } from '../queries';
import { RejectVolunteerDialog } from './RejectVolunteerDialog';
import { VolunteerCard } from './VolunteerCard';

const TABS: readonly VerificationStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

const EMPTY_COPY: Record<VerificationStatus, string> = {
  PENDING: 'No applications are waiting',
  VERIFIED: 'No verified volunteers yet',
  REJECTED: 'No rejected applications',
};

interface ReviewRequest {
  application: VolunteerApplication;
  decision: VolunteerReviewDecision;
}

export function VolunteersView() {
  const queryClient = useQueryClient();
  const now = useNow();
  const [status, setStatus] = useState<VerificationStatus>('PENDING');
  const [approving, setApproving] = useState<VolunteerApplication | null>(null);
  const [rejecting, setRejecting] = useState<VolunteerApplication | null>(null);
  const applications = useQuery(volunteerApplicationsQuery(status));

  // Document links are presigned for a limited time counted from when the list was fetched.
  const shortestLinkLifetimeS = Math.min(
    ...(applications.data ?? []).flatMap((application) => application.documents.map((document) => document.expiresInSeconds ?? Infinity)),
  );
  const linksExpired =
    Number.isFinite(shortestLinkLifetimeS) && now > applications.dataUpdatedAt + shortestLinkLifetimeS * 1_000;

  const review = useMutation({
    mutationFn: ({ application, decision }: ReviewRequest) => reviewVolunteer(application.userId, decision),
    onSuccess: (profile, { application }) => {
      rememberVolunteerDecision(queryClient, profile.userId, profile.verificationStatus);
      toast({
        title: profile.verificationStatus === 'VERIFIED' ? 'Volunteer approved' : 'Application rejected',
        description:
          profile.verificationStatus === 'VERIFIED'
            ? `${application.fullName ?? 'The volunteer'} can now accept nearby tasks.`
            : 'The applicant can see the reason and apply again.',
        variant: 'success',
      });
      setApproving(null);
      setRejecting(null);
    },
    onError: (error) => {
      if (hasErrorCode(error, 'VOLUNTEER_ALREADY_REVIEWED')) void applications.refetch();
    },
  });

  const closeDialogs = () => {
    setApproving(null);
    setRejecting(null);
    review.reset();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Volunteers"
        description="Check each applicant's identity documents before approving. Approved volunteers get the volunteer role and see tasks near them. Every listing of documents is recorded in the audit log."
        actions={
          <Button variant="outline" onClick={() => void applications.refetch()} disabled={applications.isFetching}>
            <RefreshCw className={cn(applications.isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <Tabs value={status} onValueChange={(value) => setStatus(value as VerificationStatus)}>
        <TabsList>
          {TABS.map((entry) => (
            <TabsTrigger key={entry} value={entry}>
              {VERIFICATION_STATUS_LABELS[entry]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status} className="grid gap-3 pt-2">
          {linksExpired && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                <p>Document links have expired for security. Refresh to get new ones.</p>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => void applications.refetch()}>
                  Refresh links
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {applications.isPending ? (
            <ListSkeleton rows={3} className="p-0" />
          ) : applications.error ? (
            <ErrorNotice error={applications.error} title="Applications could not be loaded" onRetry={() => void applications.refetch()} />
          ) : applications.data.length === 0 ? (
            <EmptyNotice icon={HandHelping} title={EMPTY_COPY[status]}>
              {status === 'PENDING' ? 'New applications appear after citizens register as volunteers. Refresh to check.' : null}
            </EmptyNotice>
          ) : (
            applications.data.map((application) => (
              <VolunteerCard
                key={application.userId}
                application={application}
                now={now}
                linksExpired={linksExpired}
                onApprove={setApproving}
                onReject={setRejecting}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && closeDialogs()}
        title={`Approve ${approving?.fullName ?? 'this applicant'}?`}
        description="They become a verified volunteer in this district and can accept tasks that match their skills."
        confirmLabel="Approve volunteer"
        isPending={review.isPending}
        error={review.error}
        onConfirm={() => approving && review.mutate({ application: approving, decision: { decision: 'VERIFIED' } })}
      />
      <RejectVolunteerDialog
        application={rejecting}
        isPending={review.isPending}
        error={review.error}
        onClose={closeDialogs}
        onConfirm={(application, reason) =>
          review.mutate({ application, decision: { decision: 'REJECTED', rejectionReason: reason } })
        }
      />
    </PageContainer>
  );
}
