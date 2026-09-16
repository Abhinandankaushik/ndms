'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { changeMissionStatus } from '@/lib/api/endpoints/missions';
import { queryKeys } from '@/lib/api/query-keys';
import type { Mission } from '@/lib/api/types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { syncMissionRecord } from '../realtime/cache-sync';

const NOTES_MAX_LENGTH = 2_000;

export function CancelMissionDialog({
  mission,
  teamName,
  onClose,
}: {
  mission: Mission | null;
  teamName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const notesId = useId();
  const [notes, setNotes] = useState('');
  // Keeps the title intact while the dialog animates closed after the parent has cleared its selection.
  const [shownTeamName, setShownTeamName] = useState(teamName);
  if (mission && teamName !== shownTeamName) setShownTeamName(teamName);

  const mutation = useMutation({
    mutationFn: (target: Mission) =>
      changeMissionStatus(target.id, { status: 'CANCELLED', outcomeNotes: notes.trim() || undefined }),
    onSuccess: (cancelled) => {
      syncMissionRecord(queryClient, cancelled);
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(cancelled.incidentId) });
      toast({
        title: 'Mission cancelled',
        description: `${teamName} is available again. The incident returns to verified if no other team is on it.`,
        variant: 'success',
      });
      setNotes('');
      onClose();
    },
  });

  return (
    <ConfirmDialog
      open={mission !== null}
      onOpenChange={(open) => {
        if (open) return;
        mutation.reset();
        onClose();
      }}
      title={`Cancel the mission for ${shownTeamName}?`}
      description="The team is told to stand down. Use this when the team cannot reach the incident or another team has it covered."
      confirmLabel="Cancel mission"
      destructive
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => mission && mutation.mutate(mission)}
    >
      <div className="grid gap-2">
        <Label htmlFor={notesId}>Note for the record (optional)</Label>
        <Textarea
          id={notesId}
          value={notes}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Why is the mission being cancelled?"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
