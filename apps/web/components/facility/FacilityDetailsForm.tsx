'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, Save } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { updateFacility } from '@/lib/api/endpoints/facilities';
import type { Facility, FacilityPatch } from '@/lib/api/types';
import { formatPhoneForDisplay, toE164 } from '@/lib/phone';
import { describeApiError } from './describe-error';
import { applyFacilityUpdate } from './facility-sync';
import { formatCoordinates, formatCount } from './format';
import { TagListInput } from './TagListInput';

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_AMENITIES = 30;
const MAX_AMENITY_LENGTH = 60;

const AMENITY_SUGGESTIONS = [
  'Drinking water',
  'Toilets',
  'Electricity',
  'Kitchen',
  'First aid',
  'Separate space for women',
  'Wheelchair access',
  'Phone charging',
] as const;

interface DetailsValues {
  name: string;
  contactPhone: string;
  address: string;
  amenities: string[];
}

// The baseline is what the form showed when editing began, so a save sends only the fields this person changed
// and cannot overwrite a field another staff member updated in the meantime.
interface DetailsDraft {
  baseline: DetailsValues;
  values: DetailsValues;
}

type DetailsErrors = Partial<Record<'name' | 'contactPhone', string>>;

function valuesOf(facility: Facility): DetailsValues {
  return {
    name: facility.name,
    contactPhone: facility.contactPhone ? formatPhoneForDisplay(facility.contactPhone) : '',
    address: facility.address ?? '',
    amenities: facility.amenities,
  };
}

function phoneOrNull(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return toE164(trimmed) ?? undefined;
}

function changesIn({ baseline, values }: DetailsDraft): { patch: FacilityPatch; errors: DetailsErrors } {
  const patch: FacilityPatch = {};
  const errors: DetailsErrors = {};

  const name = values.name.trim();
  if (name !== baseline.name.trim()) {
    if (name === '') errors.name = 'Enter the facility name.';
    else patch.name = name;
  }

  if (values.contactPhone.trim() !== baseline.contactPhone.trim()) {
    const phone = phoneOrNull(values.contactPhone);
    if (phone === undefined) errors.contactPhone = 'Enter a 10-digit mobile number, or a full number starting with +.';
    else if (phone !== phoneOrNull(baseline.contactPhone)) patch.contactPhone = phone;
  }

  const address = values.address.trim();
  if (address !== baseline.address.trim()) patch.address = address === '' ? null : address;

  if (values.amenities.join('\n') !== baseline.amenities.join('\n')) patch.amenities = values.amenities;

  return { patch, errors };
}

export function FacilityDetailsForm({ facility }: { facility: Facility }) {
  const nameId = useId();
  const phoneId = useId();
  const addressId = useId();
  const [draft, setDraft] = useState<DetailsDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const values = draft?.values ?? valuesOf(facility);
  const { patch, errors } = draft ? changesIn(draft) : { patch: {}, errors: {} };
  const hasChanges = Object.keys(patch).length > 0;
  const hasErrors = Object.keys(errors).length > 0;

  const save = useMutation({
    mutationFn: (changes: FacilityPatch) => updateFacility(facility.id, changes),
    onSuccess: (updated) => {
      applyFacilityUpdate(updated);
      setDraft(null);
      setShowErrors(false);
      toast({ title: 'Facility details saved', variant: 'success' });
    },
  });

  const edit = (change: Partial<DetailsValues>) => {
    if (save.isError) save.reset();
    setDraft((current) => {
      const baseline = current?.baseline ?? valuesOf(facility);
      return { baseline, values: { ...(current?.values ?? baseline), ...change } };
    });
  };

  const discard = () => {
    save.reset();
    setDraft(null);
    setShowErrors(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    if (hasChanges) save.mutate(patch);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
        <CardDescription>Shown to officials and to people looking for a place to go.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} noValidate className="contents">
        <CardContent>
          <fieldset disabled={save.isPending} className="grid min-w-0 gap-5">
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                className="h-10"
                value={values.name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="organization"
                aria-invalid={showErrors && errors.name !== undefined}
                onChange={(event) => edit({ name: event.target.value })}
              />
              {showErrors && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={phoneId}>Contact phone</Label>
              <Input
                id={phoneId}
                className="h-10"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
                value={values.contactPhone}
                aria-invalid={showErrors && errors.contactPhone !== undefined}
                onChange={(event) => edit({ contactPhone: event.target.value })}
              />
              {showErrors && errors.contactPhone ? (
                <p className="text-xs text-destructive">{errors.contactPhone}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave empty if the facility has no phone.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={addressId}>Address</Label>
              <Textarea
                id={addressId}
                rows={2}
                value={values.address}
                maxLength={MAX_ADDRESS_LENGTH}
                autoComplete="street-address"
                onChange={(event) => edit({ address: event.target.value })}
              />
            </div>

            <TagListInput
              label="Amenities"
              hint="What people can rely on here. Press Enter to add each one."
              values={values.amenities}
              onChange={(amenities) => edit({ amenities })}
              normalize={(raw) => {
                const amenity = raw.trim().replace(/\s+/g, ' ');
                return amenity.length > 0 && amenity.length <= MAX_AMENITY_LENGTH ? amenity : null;
              }}
              invalidMessage={`An amenity is 1 to ${MAX_AMENITY_LENGTH} characters.`}
              maxItems={MAX_AMENITIES}
              maxLength={MAX_AMENITY_LENGTH}
              suggestions={AMENITY_SUGGESTIONS}
              placeholder="e.g. Drinking water"
              disabled={save.isPending}
            />

            <dl className="grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-2">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Capacity</dt>
                <dd className="font-medium tabular-nums">{formatCount(facility.capacity)}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Map location</dt>
                <dd className="font-medium tabular-nums">{formatCoordinates(facility)}</dd>
              </div>
            </dl>

            {save.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{describeApiError(save.error)}</AlertDescription>
              </Alert>
            )}
          </fieldset>
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2 border-t pt-6">
          {draft && (
            <Button type="button" variant="ghost" onClick={discard} disabled={save.isPending}>
              Discard changes
            </Button>
          )}
          <Button type="submit" disabled={(!hasChanges && !hasErrors) || save.isPending}>
            {save.isPending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Save aria-hidden />}
            Save details
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
