/**
 * CountdownTimer Component
 * Displays a countdown timer for retry/cooldown periods
 */

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  /** Target timestamp (ms) to count down to */
  targetTime?: number;
  /** Alternatively, seconds remaining */
  seconds?: number;
  /** Called when countdown reaches zero */
  onComplete?: () => void;
  /** Format: 'short' = "30s", 'long' = "30 secondes" */
  format?: 'short' | 'long';
  /** Additional class names */
  className?: string;
}

export default function CountdownTimer({
  targetTime,
  seconds: initialSeconds,
  onComplete,
  format = 'short',
  className = '',
}: CountdownTimerProps) {
  const [seconds, setSeconds] = useState<number>(() => {
    if (initialSeconds !== undefined) return initialSeconds;
    if (targetTime !== undefined) {
      const remaining = Math.ceil((targetTime - Date.now()) / 1000);
      return Math.max(0, remaining);
    }
    return 0;
  });

  useEffect(() => {
    if (seconds <= 0) {
      onComplete?.();
      return;
    }

    const interval = setInterval(() => {
      setSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          onComplete?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds, onComplete]);

  // Update if targetTime changes
  useEffect(() => {
    if (targetTime !== undefined) {
      const remaining = Math.ceil((targetTime - Date.now()) / 1000);
      setSeconds(Math.max(0, remaining));
    }
  }, [targetTime]);

  // Update if initialSeconds changes
  useEffect(() => {
    if (initialSeconds !== undefined) {
      setSeconds(initialSeconds);
    }
  }, [initialSeconds]);

  const formatTime = (secs: number): string => {
    if (format === 'long') {
      if (secs >= 60) {
        const mins = Math.floor(secs / 60);
        const remainingSecs = secs % 60;
        if (remainingSecs === 0) {
          return `${mins} minute${mins > 1 ? 's' : ''}`;
        }
        return `${mins}m ${remainingSecs}s`;
      }
      return `${secs} seconde${secs > 1 ? 's' : ''}`;
    }

    // Short format
    if (secs >= 60) {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  return (
    <span className={className} role="timer" aria-live="polite">
      {formatTime(seconds)}
    </span>
  );
}

/**
 * Hook to get countdown value
 */
export function useCountdown(
  targetTime: number | null | undefined,
  onComplete?: () => void
): number | null {
  const [seconds, setSeconds] = useState<number | null>(() => {
    if (targetTime === null || targetTime === undefined) return null;
    const remaining = Math.ceil((targetTime - Date.now()) / 1000);
    return Math.max(0, remaining);
  });

  useEffect(() => {
    if (targetTime === null || targetTime === undefined) {
      setSeconds(null);
      return;
    }

    const remaining = Math.ceil((targetTime - Date.now()) / 1000);
    setSeconds(Math.max(0, remaining));

    if (remaining <= 0) {
      onComplete?.();
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const newRemaining = Math.ceil((targetTime - now) / 1000);

      if (newRemaining <= 0) {
        setSeconds(0);
        onComplete?.();
        clearInterval(interval);
      } else {
        setSeconds(newRemaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTime, onComplete]);

  return seconds;
}
