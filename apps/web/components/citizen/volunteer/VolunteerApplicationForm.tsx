'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleAlert, HandHeart, LoaderCircle } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { describeApiError, hasErrorCode } from '@/components/citizen/common/api-errors';
import { LocationField, type ChosenLocation } from '@/components/citizen/location/LocationField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { registerVolunteer } from '@/lib/api/endpoints/volunteers';
import type { VolunteerProfile } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { DEFAULT_SERVICE_RADIUS_KM, SERVICE_RADIUS_OPTIONS_KM, skillLabel, VOLUNTEER_SKILLS } from './skills';

export interface VolunteerApplicationFormProps {
  profile: VolunteerProfile | null;
  onSaved: (profile: VolunteerProfile) => void;
  onCancel?: () => void;
}

export function VolunteerApplicationForm({ profile, onSaved, onCancel }: VolunteerApplicationFormProps) {
  const formId = useId();
  const [skills, setSkills] = useState<ReadonlySet<string>>(() => new Set(profile?.skills ?? []));
  const [radiusKm, setRadiusKm] = useState(profile?.serviceRadiusKm ?? DEFAULT_SERVICE_RADIUS_KM);
  const [location, setLocation] = useState<ChosenLocation | null>(() => savedLocation(profile));
  const [isLocationMissing, setLocationMissing] = useState(false);

  const save = useMutation({
    mutationFn: registerVolunteer,
    onSuccess: (saved) => {
      toast({
        title: profile ? 'Details saved' : 'Application sent',
        description:
          saved.verificationStatus === 'VERIFIED'
            ? 'Your volunteer details are up to date.'
            : 'A district official will review your application.',
        variant: 'success',
      });
      onSaved(saved);
    },
  });

  const radiusOptions: readonly number[] = SERVICE_RADIUS_OPTIONS_KM.some((option) => option === radiusKm)
    ? SERVICE_RADIUS_OPTIONS_KM
    : [...SERVICE_RADIUS_OPTIONS_KM, radiusKm].sort((a, b) => a - b);

  const toggleSkill = (skill: string) =>
    setSkills((current) => {
      const next = new Set(current);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!location) {
      setLocationMissing(true);
      return;
    }
    save.mutate({ skills: [...skills], serviceRadiusKm: radiusKm, lat: location.lat, lon: location.lon });
  };

  return (
    <form className="grid gap-7" onSubmit={submit} noValidate>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-lg font-semibold">What can you help with?</legend>
        <p className="mb-3 text-sm text-foreground/80">Choose all that apply. Leave them empty if you can help with general tasks.</p>
        <div className="grid grid-cols-2 gap-2">
          {VOLUNTEER_SKILLS.map((skill) => {
            const isSelected = skills.has(skill);
            return (
              <label
                key={skill}
                className={cn(
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 text-base font-medium has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
                  isSelected ? 'border-foreground bg-accent' : 'border-input',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSkill(skill)}
                  className="size-5 shrink-0 accent-foreground"
                />
                {skillLabel(skill)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-lg font-semibold">How far can you travel?</legend>
        <p className="mb-3 text-sm text-foreground/80">You are only offered tasks within this distance of your location.</p>
        <div className="grid grid-cols-5 gap-1.5">
          {radiusOptions.map((option) => (
            <label
              key={option}
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-center rounded-lg border-2 px-1 text-sm font-bold whitespace-nowrap has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
                option === radiusKm ? 'border-foreground bg-foreground text-background' : 'border-input',
              )}
            >
              <input
                type="radio"
                name={`${formId}-radius`}
                value={option}
                checked={option === radiusKm}
                onChange={() => setRadiusKm(option)}
                className="sr-only"
              />
              {option} km
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-lg font-semibold">Where are you based?</legend>
        <p
          role={isLocationMissing && !location ? 'alert' : undefined}
          className={cn('mb-3 text-sm', isLocationMissing && !location ? 'font-medium text-destructive' : 'text-foreground/80')}
        >
          {isLocationMissing && !location
            ? 'Add your location so NDMS can offer you tasks nearby.'
            : 'Tasks are matched to this place. Use where you usually are.'}
        </p>
        <LocationField
          value={location}
          onChange={(next) => setLocation(next)}
          pinTitle="Where are you based?"
          invalid={isLocationMissing && !location}
        />
      </fieldset>

      {save.isError && (
        <Alert variant="destructive" className="border-destructive/60">
          <CircleAlert />
          <AlertDescription className="text-base text-foreground">{describeRegistrationError(save.error)}</AlertDescription>
        </Alert>
      )}

      <div className={cn('grid gap-2', onCancel && 'min-[400px]:grid-cols-2')}>
        <Button type="submit" size="xl" disabled={save.isPending}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : <HandHeart />}
          {profile ? 'Save details' : 'Apply to volunteer'}
        </Button>
        {onCancel && (
          <Button type="button" size="xl" variant="outline" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function savedLocation(profile: VolunteerProfile | null): ChosenLocation | null {
  if (profile?.lat == null || profile.lon == null) return null;
  return { source: 'MANUAL_PIN', lat: profile.lat, lon: profile.lon };
}

function describeRegistrationError(error: unknown): string {
  if (hasErrorCode(error, 'LOCATION_OUTSIDE_DISTRICT')) {
    return 'This place is outside the districts NDMS serves. Choose a location inside the district.';
  }
  return describeApiError(error, 'Your application could not be sent. Please try again.');
}
