'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, TriangleAlert } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { createAlert } from '@/lib/api/endpoints/alerts';
import { ALERT_SEVERITIES, USER_ROLES, type AlertSeverity, type LatLon, type UserRole } from '@/lib/api/types';
import { ALERT_SEVERITY_LABELS, ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { hasErrorCode } from '../lib/errors';
import { formatClockTime } from '../lib/format';
import { rememberAlert } from '../realtime/cache-sync';
import { AlertPreview, audienceLabel } from './AlertPreview';
import { approximateAreaKm2, geofenceProblem, toGeofencePolygon } from './geofence';

const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 2_000;
const HOUR_MS = 3_600_000;
const NO_EXPIRY = 'none';
const EXPIRY_HOURS = [1, 3, 6, 12, 24, 48, 72] as const;

const SEVERITY_HINTS: Record<AlertSeverity, string> = {
  MINOR: 'Advice; no immediate danger',
  MODERATE: 'Possible threat; be prepared',
  SEVERE: 'Significant threat; act now',
  EXTREME: 'Threat to life; act immediately',
};

const SEVERITY_CHOICE_STYLE: Record<AlertSeverity, string> = {
  MINOR: 'has-[:checked]:border-sky-600 has-[:checked]:bg-sky-50',
  MODERATE: 'has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50',
  SEVERE: 'has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50',
  EXTREME: 'has-[:checked]:border-red-700 has-[:checked]:bg-red-50',
};

export interface DraftArea {
  vertices: readonly LatLon[];
  closed: boolean;
}

export function AlertComposer({ area, onSent, className }: { area: DraftArea; onSent: () => void; className?: string }) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const messageId = useId();
  const [severity, setSeverity] = useState<AlertSeverity>('MODERATE');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [expiry, setExpiry] = useState<string>(NO_EXPIRY);
  const [isConfirming, setIsConfirming] = useState(false);

  const hasDraftArea = area.vertices.length > 0;
  const areaBlocker = draftAreaBlocker(area);
  const areaLabel =
    hasDraftArea && areaBlocker === null
      ? `Drawn area of about ${approximateAreaKm2(area.vertices).toFixed(1)} km²; only people inside it`
      : 'No area: the whole audience, wherever they are';
  const expiryHours = expiry === NO_EXPIRY ? null : Number(expiry);
  const expiryLabel = expiryHours === null ? 'Stays active until cancelled' : `${expiryHours} h after sending`;
  const canSend = title.trim().length > 0 && message.trim().length > 0 && areaBlocker === null;

  const mutation = useMutation({
    mutationFn: () =>
      createAlert({
        severity,
        title: title.trim(),
        message: message.trim(),
        targetRoles: roles.length > 0 ? roles : undefined,
        geofence: hasDraftArea ? toGeofencePolygon(area.vertices) : undefined,
        expiresAt: expiryHours === null ? undefined : new Date(Date.now() + expiryHours * HOUR_MS).toISOString(),
      }),
    onSuccess: (alert) => {
      rememberAlert(queryClient, alert);
      toast({
        title: 'Alert sent',
        description: `${ALERT_SEVERITY_LABELS[alert.severity]} alert to ${audienceLabel(alert.targetRoles).toLowerCase()}${
          alert.expiresAt ? `, active until ${formatClockTime(alert.expiresAt)}` : ''
        }.`,
        variant: 'success',
      });
      setTitle('');
      setMessage('');
      setRoles([]);
      setExpiry(NO_EXPIRY);
      setIsConfirming(false);
      onSent();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) setIsConfirming(true);
  };

  const preview = (
    <AlertPreview
      severity={severity}
      title={title}
      message={message}
      roles={roles}
      areaLabel={areaLabel}
      expiryLabel={expiryLabel}
    />
  );

  return (
    <>
      <form onSubmit={submit} className={cn('grid content-start gap-4 rounded-xl border bg-card p-4', className)}>
        <h2 className="font-semibold">New alert</h2>
        <SeverityField value={severity} onChange={setSeverity} />

        <div className="grid gap-2">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            id={titleId}
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            required
            placeholder="e.g. Flood warning for Bahadurpur block"
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {title.length}/{TITLE_MAX_LENGTH}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={messageId}>Message</Label>
          <Textarea
            id={messageId}
            value={message}
            maxLength={MESSAGE_MAX_LENGTH}
            required
            rows={4}
            placeholder="What is happening, what people should do, and where to go."
            onChange={(event) => setMessage(event.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {message.length}/{MESSAGE_MAX_LENGTH}
          </p>
        </div>

        <AudienceField value={roles} onChange={setRoles} />
        <ExpiryField value={expiry} onChange={setExpiry} />
        {preview}

        {areaBlocker && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>{areaBlocker}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" variant={severity === 'EXTREME' ? 'destructive' : 'default'} disabled={!canSend}>
          <Send />
          Review and send
        </Button>
      </form>

      <ConfirmDialog
        open={isConfirming}
        onOpenChange={(open) => {
          setIsConfirming(open);
          if (!open) mutation.reset();
        }}
        title={`Send this ${ALERT_SEVERITY_LABELS[severity].toLowerCase()} alert?`}
        description="It goes out immediately and cannot be edited. You can cancel it later from the history."
        confirmLabel="Send alert"
        destructive={severity === 'EXTREME'}
        isPending={mutation.isPending}
        error={alertErrorMessage(mutation.error)}
        onConfirm={() => mutation.mutate()}
      >
        {preview}
      </ConfirmDialog>
    </>
  );
}

function SeverityField({ value, onChange }: { value: AlertSeverity; onChange: (severity: AlertSeverity) => void }) {
  const groupName = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Severity</legend>
      <div className="grid grid-cols-2 gap-2">
        {ALERT_SEVERITIES.map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              SEVERITY_CHOICE_STYLE[option],
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="grid">
              <span className="font-medium">{ALERT_SEVERITY_LABELS[option]}</span>
              <span className="text-xs text-muted-foreground">{SEVERITY_HINTS[option]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AudienceField({ value, onChange }: { value: readonly UserRole[]; onChange: (roles: UserRole[]) => void }) {
  const idPrefix = useId();
  const toggle = (role: UserRole, checked: boolean) =>
    onChange(USER_ROLES.filter((entry) => (entry === role ? checked : value.includes(entry))));

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Audience</legend>
      <p className="text-xs text-muted-foreground">Leave every box empty to alert everyone.</p>
      <div className="grid grid-cols-2 gap-2">
        {USER_ROLES.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${role}`}
              checked={value.includes(role)}
              onCheckedChange={(checked) => toggle(role, checked === true)}
            />
            <Label htmlFor={`${idPrefix}-${role}`} className="font-normal">
              {ROLE_LABELS[role]}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function ExpiryField({ value, onChange }: { value: string; onChange: (expiry: string) => void }) {
  const selectId = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={selectId}>Expiry</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={selectId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EXPIRY}>No expiry (cancel it manually)</SelectItem>
          {EXPIRY_HOURS.map((hours) => (
            <SelectItem key={hours} value={String(hours)}>
              Expires {hours} {hours === 1 ? 'hour' : 'hours'} after sending
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function draftAreaBlocker(area: DraftArea): string | null {
  if (area.vertices.length === 0) return null;
  if (!area.closed) {
    return 'Finish the area by clicking its first point or pressing "Close shape", or clear it to alert the whole audience.';
  }
  switch (geofenceProblem(area.vertices)) {
    case null:
      return null;
    case 'SELF_INTERSECTING':
      return 'The edges of the area cross each other. Undo points, or clear the area and draw it again.';
    default:
      return 'The area is too small to use. Clear it and draw it again.';
  }
}

function alertErrorMessage(error: unknown): unknown {
  if (hasErrorCode(error, 'GEOFENCE_OUTSIDE_DISTRICT')) {
    return 'The drawn area lies outside your district. Draw it over the district and try again.';
  }
  if (hasErrorCode(error, 'GEOFENCE_INVALID')) return 'The drawn area is not a valid shape. Clear it and draw it again.';
  return error;
}
