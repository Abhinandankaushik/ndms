'use client';

import { CircleAlert, CircleCheck, Info, XIcon } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss; 0 keeps the toast until dismissed. */
  durationMs?: number;
}

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

const DEFAULT_DURATION_MS = 5_000;
const MAX_VISIBLE_TOASTS = 4;

const useToastStore = create<{ toasts: ToastItem[] }>()(() => ({ toasts: [] }));

let nextToastId = 1;

export function toast(options: ToastOptions): number {
  const item: ToastItem = {
    id: nextToastId++,
    title: options.title,
    description: options.description,
    variant: options.variant ?? 'default',
    durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
  };
  useToastStore.setState((state) => ({ toasts: [...state.toasts, item].slice(-MAX_VISIBLE_TOASTS) }));
  return item.id;
}

export function dismissToast(id: number): void {
  useToastStore.setState((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <ol
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[calc(4rem+env(safe-area-inset-top))] sm:left-auto sm:items-end"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </ol>
  );
}

const VARIANT_ICONS = {
  default: Info,
  success: CircleCheck,
  destructive: CircleAlert,
} satisfies Record<ToastVariant, unknown>;

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    if (item.durationMs <= 0) return;
    const timer = setTimeout(() => dismissToast(item.id), item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs]);

  const Icon = VARIANT_ICONS[item.variant];

  return (
    <li
      role={item.variant === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-in items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg fade-in-0 slide-in-from-top-2',
        item.variant === 'destructive' && 'border-destructive/50',
        item.variant === 'success' && 'border-success/50',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0 text-muted-foreground',
          item.variant === 'destructive' && 'text-destructive',
          item.variant === 'success' && 'text-success',
        )}
      />
      <div className="grid flex-1 gap-1">
        <p className="text-sm leading-tight font-medium">{item.title}</p>
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label="Dismiss notification"
        className="rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <XIcon className="size-4" />
      </button>
    </li>
  );
}
