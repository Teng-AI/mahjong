'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// TURN TIMER HOOK
// ============================================

interface UseTurnTimerOptions {
  /** Server timestamp when turn started */
  startTime: number | undefined;
  /** Total timer duration in seconds (null = no timer) */
  totalSeconds: number | null | undefined;
  /** Whether it's the current player's turn (only track timer when true) */
  isMyTurn: boolean;
  /** Whether we're in playing phase */
  isPlayingPhase: boolean;
  /** Callback when timer expires */
  onExpire: (turnStartTime: number) => void;
}

interface UseTurnTimerReturn {
  /** Remaining seconds (null if no timer) */
  remainingSeconds: number | null;
  /** Total timer seconds (null if no timer) */
  totalSeconds: number | null;
  /** Whether timer has expired */
  isExpired: boolean;
  /** Whether timer is in warning zone (<10 seconds) */
  isWarning: boolean;
}

const WARNING_THRESHOLD = 10; // Seconds before warning state (higher for turn timer)
const UPDATE_INTERVAL = 100; // Update every 100ms for smooth countdown

export function useTurnTimer({
  startTime,
  totalSeconds,
  isMyTurn,
  isPlayingPhase,
  onExpire,
}: UseTurnTimerOptions): UseTurnTimerReturn {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Use refs to track state that needs to be consistent within the interval
  // Refs update synchronously, avoiding the async state update race condition
  const activeTurnStartTimeRef = useRef<number | undefined>(undefined);
  const expireCalledForTurnRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);

  // Keep refs up to date
  useEffect(() => {
    activeTurnStartTimeRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Calculate remaining time
  const calculateRemaining = useCallback(() => {
    if (!isPlayingPhase || !isMyTurn || !startTime || totalSeconds === null || totalSeconds === undefined) {
      return null;
    }

    const now = Date.now();
    const elapsed = (now - startTime) / 1000; // Convert to seconds
    const remaining = Math.max(0, totalSeconds - elapsed);

    return remaining;
  }, [isPlayingPhase, isMyTurn, startTime, totalSeconds]);

  // Timer update effect
  useEffect(() => {
    // No timer if not in playing phase, not my turn, or no timer configured
    if (!isPlayingPhase || !isMyTurn || totalSeconds === null || totalSeconds === undefined || !startTime) {
      setRemainingSeconds(null);
      setIsExpired(false);
      return;
    }

    // Reset expired state when a new turn starts
    setIsExpired(false);

    // Capture the turn start time for this effect instance
    const effectTurnStartTime = startTime;

    // Calculate initial remaining time
    const initial = calculateRemaining();
    setRemainingSeconds(initial);

    // Set up interval for updates
    const intervalId = setInterval(() => {
      // Check if this interval is still for the active turn
      // This prevents stale intervals from triggering actions for wrong turns
      if (activeTurnStartTimeRef.current !== effectTurnStartTime) {
        return; // Turn changed, this interval is stale
      }

      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      // Check for expiration
      if (remaining !== null && remaining <= 0) {
        setIsExpired(true);

        // Call onExpire if:
        // 1. This is still the active turn
        // 2. We haven't already called onExpire for this turn
        if (
          activeTurnStartTimeRef.current === effectTurnStartTime &&
          effectTurnStartTime !== undefined &&
          expireCalledForTurnRef.current !== effectTurnStartTime
        ) {
          expireCalledForTurnRef.current = effectTurnStartTime;
          onExpireRef.current(effectTurnStartTime);
        }
      }
    }, UPDATE_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [isPlayingPhase, isMyTurn, startTime, totalSeconds, calculateRemaining]);

  // Calculate warning state
  const isWarning = remainingSeconds !== null && remainingSeconds <= WARNING_THRESHOLD && remainingSeconds > 0;

  return {
    remainingSeconds,
    totalSeconds: totalSeconds ?? null,
    isExpired,
    isWarning,
  };
}
