'use client';

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CountStepperProps {
  id: string;
  /** Names the count for the minus and plus buttons, e.g. "people rescued". */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  max: number;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

// Big minus and plus buttons so a count can be entered with gloves on; the field still takes typed digits.
export function CountStepper({ id, label, value, onChange, max, invalid, describedBy, disabled }: CountStepperProps) {
  const setClamped = (next: number) => onChange(Math.min(max, Math.max(0, next)));

  return (
    <div className="flex items-stretch gap-2">
      <Button
        type="button"
        variant="outline"
        className="size-14 border-2 border-slate-900"
        aria-label={`Decrease ${label}`}
        aria-controls={id}
        disabled={disabled || value === 0}
        onClick={() => setClamped(value === null ? 0 : value - 1)}
      >
        <Minus aria-hidden className="size-6" />
      </Button>
      <Input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        className="h-14 flex-1 border-2 border-slate-900 text-center text-2xl font-bold md:text-2xl"
        value={value ?? ''}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          onChange(digits === '' ? null : Math.min(max, Number(digits)));
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="size-14 border-2 border-slate-900"
        aria-label={`Increase ${label}`}
        aria-controls={id}
        disabled={disabled || value === max}
        onClick={() => setClamped(value === null ? 1 : value + 1)}
      >
        <Plus aria-hidden className="size-6" />
      </Button>
    </div>
  );
}
