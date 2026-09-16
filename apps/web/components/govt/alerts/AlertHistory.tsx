'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, LocateFixed } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { cancelAlert } from '@/lib/api/endpoints/alerts';
import type { Alert } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { AlertSeverityBadge } from '../common/badges';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { formatDateTime, formatTimeLeft } from '../lib/format';
import { useNow } from '../lib/useNow';
import { rememberAlert } from '../realtime/cache-sync';
import { alertHistoryQuery } from '../queries';
import { audienceLabel } from './AlertPreview';
import { alertState, type AlertState } from './geofence';

const STATE_STYLE: Record<AlertState, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  expired: { label: 'Expired', className: 'border-zinc-200 bg-zinc-100 text-zinc-700' },
  cancelled: { label: 'Cancelled', className: 'border-zinc-200 bg-zinc-100 text-zinc-700' },
};

export function AlertHistory({
  highlightedAlertId,
  onShowArea,
  className,
}: {
  highlightedAlertId: string | null;
  onShowArea: (alert: Alert) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const { data, error, isPending, refetch } = useQuery(alertHistoryQuery());
  const [cancelling, setCancelling] = useState<Alert | null>(null);
  const headingId = useId();

  const cancel = useMutation({
    mutationFn: (alert: Alert) => cancelAlert(alert.id),
    onSuccess: (alert) => {
      rememberAlert(queryClient, alert);
      toast({ title: 'Alert cancelled', description: 'It no longer shows as active to anyone.', variant: 'success' });
      setCancelling(null);
    },
  });

  return (
    <section aria-labelledby={headingId} className={cn('grid gap-3', className)}>
      <h2 id={headingId} className="text-lg font-semibold">
        Sent alerts
      </h2>
      <div className="rounded-xl border bg-card">
        {isPending ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorNotice error={error} title="Alert history could not be loaded" onRetry={() => void refetch()} className="m-3 w-auto" />
        ) : data.length === 0 ? (
          <EmptyNotice icon={History} title="No alerts sent from this district yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Alert</TableHead>
                <TableHead>Sent to</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((alert) => {
                const state = alertState(alert, now);
                return (
                  <TableRow key={alert.id} data-state={alert.id === highlightedAlertId ? 'selected' : undefined}>
                    <TableCell>
                      <AlertSeverityBadge severity={alert.severity} />
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      <p className="font-medium">{alert.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{alert.message}</p>
                    </TableCell>
                    <TableCell className="max-w-48 text-sm whitespace-normal">
                      {audienceLabel(alert.targetRoles)}
                      <span className="block text-xs text-muted-foreground">{alert.geofence ? 'Inside a drawn area' : 'Everywhere'}</span>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(alert.issuedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATE_STYLE[state].className}>
                        {STATE_STYLE[state].label}
                      </Badge>
                      {state === 'active' && alert.expiresAt && (
                        <span className="block text-xs text-muted-foreground">Expires {formatTimeLeft(alert.expiresAt, now)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {alert.geofence && (
                          <Button variant="ghost" size="sm" onClick={() => onShowArea(alert)}>
                            <LocateFixed />
                            Show area
                          </Button>
                        )}
                        {state === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => setCancelling(alert)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (open) return;
          setCancelling(null);
          cancel.reset();
        }}
        title="Cancel this alert?"
        description={cancelling ? `"${cancelling.title}" stops showing as active for everyone who received it.` : ''}
        confirmLabel="Cancel alert"
        destructive
        isPending={cancel.isPending}
        error={cancel.error}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
      />
    </section>
  );
}
