import { useEffect, useState } from 'react';
import { serverNow } from '../protocol/roomClient';

/** Whole seconds left until a server timestamp (0 when it has passed or is unset), by the server's clock. */
export function useCountdown(endsAt: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(timer);
  }, []);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}
