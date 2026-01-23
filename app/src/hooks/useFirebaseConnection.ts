import { useEffect, useState, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '@/firebase/config';
import { ConnectionStatus } from '@/types';

const GRACE_PERIOD_MS = 2000; // Don't show UI for brief disconnects
const FAILED_TIMEOUT_MS = 30000; // Show "Failed" after 30s

interface UseFirebaseConnectionReturn {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Timestamp when connection was lost (null if connected) */
  disconnectedAt: number | null;
  /** Increments each time we reconnect (use as effect dependency to force re-sync) */
  reconnectCount: number;
  /** Force a reconnection attempt */
  forceReconnect: () => void;
}

export function useFirebaseConnection(): UseFirebaseConnectionReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Refs for timers
  const graceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const failedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track if we've ever been connected (skip grace period on initial load)
  const hasEverConnectedRef = useRef(false);

  // Track previous connection state to detect reconnection
  const wasDisconnectedRef = useRef(false);

  // Subscribe to Firebase connection state
  useEffect(() => {
    const connectedRef = ref(db, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val() === true;

      // Clear any existing timers
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      if (failedTimeoutRef.current) {
        clearTimeout(failedTimeoutRef.current);
        failedTimeoutRef.current = null;
      }

      if (connected) {
        // Track that we've connected at least once
        hasEverConnectedRef.current = true;

        // If we were disconnected before, this is a reconnection
        if (wasDisconnectedRef.current) {
          setReconnectCount((c) => c + 1);
        }
        wasDisconnectedRef.current = false;

        setConnectionStatus('connected');
        setDisconnectedAt(null);
      } else {
        // Disconnected
        wasDisconnectedRef.current = true;

        // Don't show UI until we've connected once (handles initial page load)
        if (!hasEverConnectedRef.current) {
          return;
        }

        const now = Date.now();
        setDisconnectedAt(now);

        // After grace period, show "reconnecting"
        graceTimeoutRef.current = setTimeout(() => {
          setConnectionStatus('reconnecting');

          // After failed timeout, show "failed"
          failedTimeoutRef.current = setTimeout(() => {
            setConnectionStatus('failed');
          }, FAILED_TIMEOUT_MS - GRACE_PERIOD_MS);
        }, GRACE_PERIOD_MS);
      }
    });

    return () => {
      unsubscribe();
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current);
      }
      if (failedTimeoutRef.current) {
        clearTimeout(failedTimeoutRef.current);
      }
    };
  }, []);

  // Force reconnect by resetting state
  const forceReconnect = useCallback(() => {
    // Firebase Realtime Database automatically handles reconnection
    // The best we can do is reset our state and let Firebase retry
    setConnectionStatus('reconnecting');
    setDisconnectedAt(Date.now());

    // Clear failed timeout and set a new one
    if (failedTimeoutRef.current) {
      clearTimeout(failedTimeoutRef.current);
    }
    failedTimeoutRef.current = setTimeout(() => {
      // Only set to failed if still not connected
      setConnectionStatus((current) => (current === 'reconnecting' ? 'failed' : current));
    }, FAILED_TIMEOUT_MS);
  }, []);

  return {
    connectionStatus,
    disconnectedAt,
    reconnectCount,
    forceReconnect,
  };
}
