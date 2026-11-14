import { useEffect, useState } from 'react';

/** Whole seconds left until a server timestamp (0 when it has passed or is unset). */
export function useCountdown(endsAt: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}
