'use client';

import { useState, useEffect, useRef } from 'react';
import { ConnectionStatus } from '@/types';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  disconnectedAt: number | null;
  onRetry: () => void;
}

export function ConnectionBanner({ status, disconnectedAt, onRetry }: ConnectionBannerProps) {
  // Track seconds since disconnect with an interval
  const [secondsDisconnected, setSecondsDisconnected] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't run timer when connected or no disconnect time
    if (status === 'connected' || disconnectedAt === null) {
      return;
    }

    // Update timer every second via interval callback (not synchronously in effect)
    const updateTimer = () => {
      setSecondsDisconnected(Math.floor((Date.now() - disconnectedAt) / 1000));
    };

    // Initial update after a microtask to avoid synchronous setState
    queueMicrotask(updateTimer);

    // Then update every second
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, disconnectedAt]);

  // Reset to 0 when we reconnect
  useEffect(() => {
    if (status === 'connected') {
      queueMicrotask(() => setSecondsDisconnected(0));
    }
  }, [status]);

  // Don't render anything when connected
  if (status === 'connected') {
    return null;
  }

  if (status === 'reconnecting') {
    return (
      <div className="bg-yellow-500/30 border border-yellow-500/50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Spinner */}
          <svg
            className="animate-spin h-4 w-4 text-yellow-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-yellow-200 text-sm">
            Reconnecting...
            {secondsDisconnected > 5 && (
              <span className="text-yellow-400 ml-1">
                ({secondsDisconnected}s)
              </span>
            )}
          </span>
        </div>
      </div>
    );
  }

  // Failed state
  return (
    <div className="bg-red-500/30 border border-red-500/50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {/* Warning icon */}
        <svg
          className="h-4 w-4 text-red-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-red-200 text-sm">
          Connection lost. Check your network.
        </span>
      </div>
      <button
        onClick={onRetry}
        className="px-3 py-1 bg-red-500/50 hover:bg-red-500/70 text-red-100 text-sm rounded-md transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
