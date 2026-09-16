'use client';

import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster';
import { updateFacility } from '@/lib/api/endpoints/facilities';
import type { Facility } from '@/lib/api/types';
import { FACILITY_KIND_LABELS } from '@/lib/labels';
import { describeApiError } from './describe-error';
import { applyFacilityUpdate } from './facility-sync';

export function OperationalStatusCard({ facility }: { facility: Facility }) {
  const switchId = useId();
  const [isConfirmingClosure, setIsConfirmingClosure] = useState(false);
  const kindLabel = FACILITY_KIND_LABELS[facility.kind].toLowerCase();

  const setOperational = useMutation({
    mutationFn: (isOperational: boolean) => updateFacility(facility.id, { isOperational }),
    onSuccess: (updated) => {
      applyFacilityUpdate(updated);
      setIsConfirmingClosure(false);
      toast({
        title: updated.isOperational ? 'Marked as operational' : 'Marked as not operational',
        variant: 'success',
      });
    },
    onError: (error) =>
      toast({ title: 'Status not changed', description: describeApiError(error), variant: 'destructive' }),
  });

  const isOperational = setOperational.isPending ? (setOperational.variables ?? facility.isOperational) : facility.isOperational;

  const requestChange = (next: boolean) => {
    if (next) setOperational.mutate(true);
    else setIsConfirmingClosure(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Operational status</CardTitle>
        <CardDescription>
          Only operational facilities with free space are suggested to people looking for a {kindLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <Label htmlFor={switchId} className="grid cursor-pointer gap-1">
            <span className="text-base">{isOperational ? 'Operational' : 'Not operational'}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {isOperational ? 'Open and receiving people.' : 'Hidden from searches for a place with space.'}
            </span>
          </Label>
          <div className="flex items-center gap-2">
            {setOperational.isPending && <LoaderCircle aria-hidden className="size-4 animate-spin text-muted-foreground" />}
            <Switch
              id={switchId}
              className="scale-125"
              checked={isOperational}
              disabled={setOperational.isPending}
              onCheckedChange={requestChange}
            />
          </div>
        </div>
      </CardContent>

      <Dialog
        open={isConfirmingClosure}
        onOpenChange={(open) => {
          if (!setOperational.isPending) setIsConfirmingClosure(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {facility.name} as not operational?</DialogTitle>
            <DialogDescription>
              It will no longer be suggested to people looking for a {kindLabel} with space. Occupancy and supplies
              stay as they are, and you can switch it back at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={setOperational.isPending} onClick={() => setIsConfirmingClosure(false)}>
              Keep operational
            </Button>
            <Button variant="destructive" disabled={setOperational.isPending} onClick={() => setOperational.mutate(false)}>
              {setOperational.isPending && <LoaderCircle aria-hidden className="animate-spin" />}
              Mark not operational
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
