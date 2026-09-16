import { useEffect, useState } from 'react';

export function useNow(refreshMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  return now;
}
