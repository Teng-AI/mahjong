'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// CALLING PHASE TIMER HOOK
// ============================================

interface UseCallingTimerOptions {
  /** Server timestamp when calling phase started */
  startTime: number | undefined;
  /** Total timer duration in seconds (null = no timer) */
  totalSeconds: number | null | undefined;
  /** Current calling phase ID (for stale detection) */
  phaseId: number | undefined;
  /** Whether we're in calling phase */
  isCallingPhase: boolean;
  /** Whether the current player has already responded */
  hasResponded: boolean;
  /** Callback when timer expires */
  onExpire: (phaseId: number) => void;
}

interface UseCallingTimerReturn {
  /** Remaining seconds (null if no timer) */
  remainingSeconds: number | null;
  /** Total timer seconds (null if no timer) */
  totalSeconds: number | null;
  /** Whether timer has expired */
  isExpired: boolean;
  /** Whether timer is in warning zone (<5 seconds) */
  isWarning: boolean;
}

const WARNING_THRESHOLD = 5; // Seconds before warning state
const UPDATE_INTERVAL = 100; // Update every 100ms for smooth countdown

export function useCallingTimer({
  startTime,
  totalSeconds,
  phaseId,
  isCallingPhase,
  hasResponded,
  onExpire,
}: UseCallingTimerOptions): UseCallingTimerReturn {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Use refs to track state that needs to be consistent within the interval
  // Refs update synchronously, avoiding the async state update race condition
  const activePhaseIdRef = useRef<number | undefined>(undefined);
  const hasRespondedRef = useRef(false);
  const expireCalledForPhaseRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);

  // Keep refs up to date
  useEffect(() => {
    activePhaseIdRef.current = phaseId;
  }, [phaseId]);

  useEffect(() => {
    hasRespondedRef.current = hasResponded;
  }, [hasResponded]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Calculate remaining time
  const calculateRemaining = useCallback(() => {
    if (!isCallingPhase || !startTime || totalSeconds === null || totalSeconds === undefined) {
      return null;
    }

    const now = Date.now();
    const elapsed = (now - startTime) / 1000; // Convert to seconds
    const remaining = Math.max(0, totalSeconds - elapsed);

    return remaining;
  }, [isCallingPhase, startTime, totalSeconds]);

  // Timer update effect
  useEffect(() => {
    // No timer if not in calling phase or no timer configured
    if (!isCallingPhase || totalSeconds === null || totalSeconds === undefined || !startTime) {
      setRemainingSeconds(null);
      setIsExpired(false);
      return;
    }

    // Reset expired state when a new phase starts
    setIsExpired(false);

    // Capture the phase ID for this effect instance
    const effectPhaseId = phaseId;

    // Calculate initial remaining time
    const initial = calculateRemaining();
    setRemainingSeconds(initial);

    // Set up interval for updates
    const intervalId = setInterval(() => {
      // Check if this interval is still for the active phase
      // This prevents stale intervals from triggering actions for wrong phases
      if (activePhaseIdRef.current !== effectPhaseId) {
        return; // Phase changed, this interval is stale
      }

      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      // Check for expiration
      if (remaining !== null && remaining <= 0) {
        setIsExpired(true);

        // Call onExpire if:
        // 1. This is still the active phase
        // 2. Player hasn't responded yet
        // 3. We haven't already called onExpire for this phase
        if (
          activePhaseIdRef.current === effectPhaseId &&
          !hasRespondedRef.current &&
          effectPhaseId !== undefined &&
          expireCalledForPhaseRef.current !== effectPhaseId
        ) {
          expireCalledForPhaseRef.current = effectPhaseId;
          onExpireRef.current(effectPhaseId);
        }
      }
    }, UPDATE_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [isCallingPhase, startTime, totalSeconds, phaseId, calculateRemaining]);

  // Calculate warning state
  const isWarning = remainingSeconds !== null && remainingSeconds <= WARNING_THRESHOLD && remainingSeconds > 0;

  return {
    remainingSeconds,
    totalSeconds: totalSeconds ?? null,
    isExpired,
    isWarning,
  };
}
