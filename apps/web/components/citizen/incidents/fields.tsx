'use client';

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DISASTER_TYPES, type DisasterType } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { DISASTER_TYPE_ICONS } from './presentation';

export const MAX_PEOPLE_AFFECTED = 100_000;
export const MAX_DESCRIPTION_LENGTH = 2_000;
export const MAX_ADDRESS_LENGTH = 500;

export interface IncidentTypePickerProps {
  name: string;
  value: DisasterType | null;
  onChange: (type: DisasterType) => void;
  invalid?: boolean;
}

export function IncidentTypePicker({ name, value, onChange, invalid = false }: IncidentTypePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DISASTER_TYPES.map((type) => {
        const Icon = DISASTER_TYPE_ICONS[type];
        const isChecked = value === type;
        return (
          <label
            key={type}
            className={cn(
              'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-base font-medium transition-colors has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
              isChecked
                ? 'border-foreground bg-foreground text-background'
                : invalid
                  ? 'border-destructive bg-background'
                  : 'border-input bg-background hover:bg-accent',
            )}
          >
            <input
              type="radio"
              name={name}
              value={type}
              checked={isChecked}
              onChange={() => onChange(type)}
              aria-invalid={invalid || undefined}
              className="sr-only"
            />
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className="leading-tight">{DISASTER_TYPE_LABELS[type]}</span>
          </label>
        );
      })}
    </div>
  );
}

export interface PeopleCounterProps {
  id: string;
  value: number;
  onChange: (value: number) => void;
  describedBy?: string;
}

export function PeopleCounter({ id, value, onChange, describedBy }: PeopleCounterProps) {
  const set = (next: number) => onChange(Math.min(MAX_PEOPLE_AFFECTED, Math.max(0, Math.trunc(next))));

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="size-12"
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label="One person fewer"
      >
        <Minus className="size-5" />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_PEOPLE_AFFECTED}
        step={1}
        value={String(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          set(Number.isNaN(parsed) ? 0 : parsed);
        }}
        aria-describedby={describedBy}
        className="h-12 w-24 text-center text-lg font-semibold md:text-lg"
      />
      <Button
        type="button"
        variant="outline"
        className="size-12"
        onClick={() => set(value + 1)}
        disabled={value >= MAX_PEOPLE_AFFECTED}
        aria-label="One person more"
      >
        <Plus className="size-5" />
      </Button>
    </div>
  );
}

export interface VulnerabilityFlags {
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
}

const VULNERABILITY_OPTIONS: readonly { key: keyof VulnerabilityFlags; label: string }[] = [
  { key: 'hasElderly', label: 'Elderly people' },
  { key: 'hasChildren', label: 'Children' },
  { key: 'hasInjured', label: 'Someone is injured' },
];

export function VulnerabilityToggles({
  value,
  onChange,
}: {
  value: VulnerabilityFlags;
  onChange: (value: VulnerabilityFlags) => void;
}) {
  return (
    <div className="grid gap-2">
      {VULNERABILITY_OPTIONS.map(({ key, label }) => (
        <label
          key={key}
          className={cn(
            'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 text-base font-medium has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
            value[key] ? 'border-foreground bg-accent' : 'border-input',
          )}
        >
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            className="size-5 shrink-0 accent-foreground"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
