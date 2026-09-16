'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

const SLOW_HINT_AFTER_MS = 4_000;

export function SplashScreen({ message }: { message: string }) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <LoaderCircle aria-hidden className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm font-medium">{message}</p>
      {isSlow && (
        <p className="max-w-xs text-xs text-muted-foreground">
          Still connecting. On a weak network this can take a little longer; NDMS keeps retrying.
        </p>
      )}
    </div>
  );
}
