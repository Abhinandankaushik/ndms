'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { describeApiError, hasErrorCode } from '@/components/citizen/common/api-errors';
import { useNow } from '@/components/citizen/common/hooks';
import { CitizenPage, ErrorPanel, LoadingBlocks, PageHeader, Panel } from '@/components/citizen/common/page';
import { getMyVolunteerProfile } from '@/lib/api/endpoints/volunteers';
import { queryKeys } from '@/lib/api/query-keys';
import type { VolunteerProfile } from '@/lib/api/types';
import { refreshAccessToken, useSessionUser } from '@/lib/auth/session';
import { ApplicationStatusCard } from './ApplicationStatusCard';
import { DocumentUploadCard } from './DocumentUploadCard';
import { VolunteerApplicationForm } from './VolunteerApplicationForm';
import { VolunteerTasksSection } from './VolunteerTasksSection';

export function VolunteerHub() {
  const now = useNow();
  const queryClient = useQueryClient();
  const [isEditing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: queryKeys.volunteers.me,
    queryFn: ({ signal }) => fetchOwnProfile(signal),
  });
  useRoleCatchUp(profile.data ?? null);

  const saveProfile = (saved: VolunteerProfile) => {
    queryClient.setQueryData(queryKeys.volunteers.me, saved);
    setEditing(false);
  };

  return (
    <CitizenPage>
      <PageHeader
        title="Volunteer"
        description="Verified volunteers get tasks near them from district officials and shelters."
      />
      {profile.data === undefined ? (
        profile.isError ? (
          <ErrorPanel
            title="Your volunteer details could not be loaded"
            message={describeApiError(profile.error)}
            onRetry={() => void profile.refetch()}
            isRetrying={profile.isFetching}
          />
        ) : (
          <LoadingBlocks count={2} label="Loading your volunteer details" />
        )
      ) : profile.data === null ? (
        <Panel title="Apply to volunteer">
          <VolunteerApplicationForm profile={null} onSaved={saveProfile} />
        </Panel>
      ) : isEditing ? (
        <Panel title={profile.data.verificationStatus === 'REJECTED' ? 'Apply again' : 'Edit your details'}>
          <VolunteerApplicationForm profile={profile.data} onSaved={saveProfile} onCancel={() => setEditing(false)} />
        </Panel>
      ) : (
        <>
          <ApplicationStatusCard profile={profile.data} now={now} onEdit={() => setEditing(true)} />
          {profile.data.verificationStatus === 'VERIFIED' ? (
            <VolunteerTasksSection profile={profile.data} now={now} />
          ) : (
            <DocumentUploadCard />
          )}
        </>
      )}
    </CitizenPage>
  );
}

async function fetchOwnProfile(signal: AbortSignal): Promise<VolunteerProfile | null> {
  try {
    return await getMyVolunteerProfile({ signal });
  } catch (error) {
    if (hasErrorCode(error, 'VOLUNTEER_NOT_FOUND')) return null;
    throw error;
  }
}

// Verification promotes the account to VOLUNTEER, but the access token keeps the old role until it is refreshed.
// The new token moves the live connection into the volunteer room, where new tasks are announced.
function useRoleCatchUp(profile: VolunteerProfile | null): void {
  const role = useSessionUser()?.role ?? null;
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.verificationStatus !== 'VERIFIED' || role !== 'CITIZEN' || refreshedFor.current === profile.userId) return;
    refreshedFor.current = profile.userId;
    refreshAccessToken().catch(() => undefined);
  }, [profile, role]);
}
