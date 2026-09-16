'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Bed,
  BriefcaseMedical,
  Droplets,
  LoaderCircle,
  Minus,
  Plus,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { adjustInventory } from '@/lib/api/endpoints/facilities';
import type { InventoryItem, InventoryLine } from '@/lib/api/types';
import { INVENTORY_ITEM_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { isLowStock } from './capacity';
import { describeApiError } from './describe-error';
import { applyServerStockLine, stockSync, usePendingDelta } from './facility-sync';
import { formatCount, formatSignedStep, pluralize } from './format';
import { SaveStatus } from './SaveStatus';
import { useOnlineStatus } from './use-online-status';

const STOCK_ICONS: Record<InventoryItem, LucideIcon> = {
  FOOD_PACKET: UtensilsCrossed,
  WATER_LITRE: Droplets,
  MEDICAL_KIT: BriefcaseMedical,
  BLANKET: Bed,
};

const STOCK_UNITS: Record<InventoryItem, [string, string]> = {
  FOOD_PACKET: ['packet', 'packets'],
  WATER_LITRE: ['litre', 'litres'],
  MEDICAL_KIT: ['kit', 'kits'],
  BLANKET: ['blanket', 'blankets'],
};

const QUICK_STEPS = [-10, -1, 1, 10] as const;
const MAX_ADJUSTMENT = 1_000_000;

export interface StockCardProps {
  facilityId: string;
  line: InventoryLine;
}

export function StockCard({ facilityId, line }: StockCardProps) {
  const target = { facilityId, item: line.item };
  const pending = usePendingDelta(stockSync, target);
  const isOnline = useOnlineStatus();
  const isLow = isLowStock(line.quantity, line.lowStockThreshold);
  const Icon = STOCK_ICONS[line.item];
  const units = STOCK_UNITS[line.item];
  const adjust = (delta: number) => stockSync.push(target, delta);

  return (
    <Card className={cn('gap-4', isLow && 'border-warning bg-warning/10')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden className="size-5 text-muted-foreground" />
          {INVENTORY_ITEM_LABELS[line.item]}
        </CardTitle>
        {isLow && (
          <CardAction>
            <Badge variant="warning">
              <TriangleAlert aria-hidden />
              Low stock
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p aria-live="polite" className="tabular-nums">
            <span className="text-4xl font-bold tracking-tight">{formatCount(line.quantity)}</span>
            <span className="text-muted-foreground"> {line.quantity === 1 ? units[0] : units[1]}</span>
          </p>
          <SaveStatus pending={pending} />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {QUICK_STEPS.map((step) => (
            <Button
              key={step}
              type="button"
              variant={step > 0 ? 'secondary' : 'outline'}
              className="h-12 touch-manipulation text-base font-semibold tabular-nums"
              aria-label={`${step > 0 ? 'Add' : 'Remove'} ${pluralize(Math.abs(step), units)}`}
              disabled={!isOnline || (step < 0 && line.quantity === 0)}
              onClick={() => adjust(step)}
            >
              {formatSignedStep(step)}
            </Button>
          ))}
        </div>

        <AdjustByAmountForm units={units} disabled={!isOnline} canRemove={line.quantity > 0} onAdjust={adjust} />

        <LowStockThresholdEditor
          facilityId={facilityId}
          item={line.item}
          threshold={line.lowStockThreshold}
          disabled={!isOnline}
        />
      </CardContent>
    </Card>
  );
}

function parseAmount(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const amount = Number(raw.trim());
  return amount > 0 && amount <= MAX_ADJUSTMENT ? amount : null;
}

interface AdjustByAmountFormProps {
  units: readonly [string, string];
  disabled: boolean;
  canRemove: boolean;
  onAdjust: (delta: number) => void;
}

function AdjustByAmountForm({ units, disabled, canRemove, onAdjust }: AdjustByAmountFormProps) {
  const inputId = useId();
  const [amount, setAmount] = useState('');
  const parsed = parseAmount(amount);

  const apply = (sign: 1 | -1) => {
    if (parsed === null) return;
    onAdjust(sign * parsed);
    setAmount('');
  };

  const addOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(1);
  };

  return (
    <form className="grid gap-2" onSubmit={addOnSubmit} noValidate>
      <Label htmlFor={inputId} className="text-muted-foreground">
        Adjust by an amount
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder={`Number of ${units[1]}`}
          className="h-11 min-w-0 flex-1"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').slice(0, 7))}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label={`Remove this many ${units[1]}`}
          title="Remove"
          disabled={disabled || parsed === null || !canRemove}
          onClick={() => apply(-1)}
        >
          <Minus aria-hidden className="size-5" />
        </Button>
        <Button
          type="submit"
          size="icon"
          className="size-11"
          aria-label={`Add this many ${units[1]}`}
          title="Add"
          disabled={disabled || parsed === null}
        >
          <Plus aria-hidden className="size-5" />
        </Button>
      </div>
    </form>
  );
}

interface LowStockThresholdEditorProps {
  facilityId: string;
  item: InventoryItem;
  threshold: number | null;
  disabled: boolean;
}

function LowStockThresholdEditor({ facilityId, item, threshold, disabled }: LowStockThresholdEditorProps) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (lowStockThreshold: number | null) => adjustInventory(facilityId, item, { lowStockThreshold }),
    onSuccess: (line) => {
      applyServerStockLine(facilityId, line);
      setDraft(null);
      toast({
        title: line.lowStockThreshold === null ? 'Low-stock alert removed' : 'Low-stock alert saved',
        description: INVENTORY_ITEM_LABELS[item],
        variant: 'success',
      });
    },
    onError: (error) =>
      toast({ title: 'Low-stock alert not saved', description: describeApiError(error), variant: 'destructive' }),
  });

  if (draft === null) {
    return (
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">
          {threshold === null ? 'No low-stock alert set' : `Low-stock alert at ${formatCount(threshold)} or fewer`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setDraft(threshold === null ? '' : String(threshold))}>
          {threshold === null ? 'Set alert' : 'Change'}
        </Button>
      </div>
    );
  }

  const parsed = draft.trim() === '' ? null : Number(draft);
  const isValid = parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_ADJUSTMENT;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isValid) save.mutate(parsed);
  };

  return (
    <form className="grid gap-2 border-t pt-3" onSubmit={submit} noValidate>
      <Label htmlFor={inputId}>Warn when stock is at or below</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={inputId}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className="h-10 w-28"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 7))}
          autoFocus
        />
        <Button type="submit" className="h-10" disabled={disabled || !isValid || save.isPending}>
          {save.isPending && <LoaderCircle aria-hidden className="animate-spin" />}
          Save
        </Button>
        {threshold !== null && (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={disabled || save.isPending}
            onClick={() => save.mutate(null)}
          >
            Remove alert
          </Button>
        )}
        <Button type="button" variant="ghost" className="h-10" disabled={save.isPending} onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
