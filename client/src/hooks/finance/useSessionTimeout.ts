import { useState, useEffect, useCallback, useRef } from 'react';

const WARNING_THRESHOLD_MS = 12 * 60 * 1000; // 12 minutes
const TIMEOUT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;

interface UseSessionTimeoutOptions {
  enabled: boolean;
  warningMs?: number;
  timeoutMs?: number;
  onTimeout?: () => void;
}

interface UseSessionTimeoutReturn {
  isWarning: boolean;
  isTimedOut: boolean;
  remainingSeconds: number;
  resetTimer: () => void;
}

export function useSessionTimeout({
  enabled,
  warningMs = WARNING_THRESHOLD_MS,
  timeoutMs = TIMEOUT_THRESHOLD_MS,
  onTimeout,
}: UseSessionTimeoutOptions): UseSessionTimeoutReturn {
  const [isWarning, setIsWarning] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.floor(timeoutMs / 1000));
  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setIsTimedOut(false);
    setRemainingSeconds(Math.floor(timeoutMs / 1000));

    warningTimerRef.current = setTimeout(() => {
      setIsWarning(true);
      const timeoutRemaining = timeoutMs - warningMs;
      setRemainingSeconds(Math.floor(timeoutRemaining / 1000));

      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - lastActivityRef.current;
        const remaining = Math.max(0, Math.floor((timeoutMs - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
        }
      }, 1000);
    }, warningMs);

    timeoutTimerRef.current = setTimeout(() => {
      setIsTimedOut(true);
      setIsWarning(false);
      clearTimers();
      onTimeout?.();
    }, timeoutMs);
  }, [warningMs, timeoutMs, onTimeout, clearTimers]);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    startTimers();
  }, [enabled, startTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setIsWarning(false);
      setIsTimedOut(false);
      return;
    }

    startTimers();

    const handleActivity = () => {
      // Only reset if not yet in warning state to avoid flickering
      // Once warning shows, user must explicitly click "Stay connected"
      if (!isWarning && !isTimedOut) {
        lastActivityRef.current = Date.now();
        // Debounce: don't restart timers on every event
        clearTimers();
        startTimers();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isWarning,
    isTimedOut,
    remainingSeconds,
    resetTimer,
  };
}
