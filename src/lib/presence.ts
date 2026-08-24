import { useEffect, useState } from 'react';

/** Keep the last value mounted for `exitMs` so CSS can play an exit. */
export function usePresence<T>(value: T | null, exitMs = 280): { shown: T | null; exiting: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (value !== null) {
      setShown(value);
      setExiting(false);
      return;
    }
    if (shown === null) return;
    setExiting(true);
    const t = window.setTimeout(() => {
      setShown(null);
      setExiting(false);
    }, exitMs);
    return () => window.clearTimeout(t);
  }, [value, exitMs, shown]);

  return { shown, exiting };
}
