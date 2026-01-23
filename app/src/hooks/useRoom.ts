import { useEffect, useState, useCallback, useRef } from 'react';
import { ref, onDisconnect, set } from 'firebase/database';
import { db } from '@/firebase/config';
import { Room, SeatIndex } from '@/types';
import {
  subscribeToRoom,
  joinRoom,
  leaveRoom,
  removePlayer,
  updatePlayerConnection,
  updatePlayerName,
  setDealer,
  setCallingTimer,
  setTurnTimer,
  updateRoomStatus,
  getPlayerCount,
  isRoomFull,
  isHost as checkIsHost,
  findUserSeat,
} from '@/lib/rooms';

interface UseRoomOptions {
  roomCode: string;
  userId: string | null;
  userName?: string;
  autoJoin?: boolean;
}

interface UseRoomReturn {
  room: Room | null;
  loading: boolean;
  error: string | null;
  mySeat: SeatIndex | null;
  isHost: boolean;
  playerCount: number;
  isFull: boolean;
  callingTimerSeconds: number | null;
  turnTimerSeconds: number | null;
  join: (name: string) => Promise<void>;
  leave: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setDealerSeat: (seat: SeatIndex) => Promise<void>;
  setCallingTimerSeconds: (seconds: number | null) => Promise<void>;
  setTurnTimerSeconds: (seconds: number | null) => Promise<void>;
  startGame: () => Promise<void>;
  kickPlayer: (seat: SeatIndex) => Promise<void>;
}

export function useRoom({
  roomCode,
  userId,
  userName,
  autoJoin = false,
}: UseRoomOptions): UseRoomReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<SeatIndex | null>(null);
  const [hasJoined, setHasJoined] = useState(false);

  // Subscribe to room changes
  useEffect(() => {
    if (!roomCode) {
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => setLoading(false));
      return;
    }

    // Set loading state before subscribing
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    const unsubscribe = subscribeToRoom(roomCode, (roomData) => {
      if (roomData) {
        setRoom(roomData);
        // Update my seat if I'm in the room
        if (userId) {
          const seat = findUserSeat(roomData, userId);
          setMySeat(seat);
        }
      } else {
        setRoom(null);
        setMySeat(null);
        setError('Room not found');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomCode, userId]);

  // Auto-join if enabled
  useEffect(() => {
    if (autoJoin && room && userId && userName && !hasJoined && mySeat === null) {
      joinRoom(roomCode, userId, userName)
        .then(({ seat }) => {
          setMySeat(seat);
          setHasJoined(true);
        })
        .catch((err) => {
          setError(err.message);
        });
    }
  }, [autoJoin, room, userId, userName, hasJoined, mySeat, roomCode]);

  // Track if onDisconnect has been set up
  const onDisconnectSetupRef = useRef(false);
  // Track pending disconnect timeout for visibility-based disconnection
  const visibilityDisconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to always have current mySeat value (avoids stale closure in event handlers)
  const mySeatRef = useRef<SeatIndex | null>(mySeat);

  // Keep mySeatRef in sync with mySeat (must be in effect, not during render)
  useEffect(() => {
    mySeatRef.current = mySeat;
  }, [mySeat]);

  // Delay before marking disconnected on visibility hidden (allows for brief app switches)
  const VISIBILITY_DISCONNECT_DELAY_MS = 5000;

  // Set up Firebase presence with onDisconnect for server-side disconnect detection
  useEffect(() => {
    if (mySeat === null || !roomCode) {
      return;
    }

    const connectedRef = ref(db, `rooms/${roomCode}/players/seat${mySeat}/connected`);
    const lastSeenRef = ref(db, `rooms/${roomCode}/players/seat${mySeat}/lastSeen`);

    // Set up onDisconnect handlers (server-side)
    // These will automatically mark player as disconnected if connection drops
    const setupPresence = async () => {
      try {
        // Register what happens when we disconnect
        await onDisconnect(connectedRef).set(false);
        await onDisconnect(lastSeenRef).set(Date.now());

        // Then mark ourselves as connected
        await set(connectedRef, true);
        await set(lastSeenRef, Date.now());

        onDisconnectSetupRef.current = true;
      } catch (err) {
        console.error('Failed to set up presence:', err);
      }
    };

    setupPresence();

    // Visibility change handler with delayed disconnect
    // - On hidden: wait 5s before marking disconnected (handles brief app switches)
    // - On visible: immediately mark connected and clear any pending disconnect
    // Uses mySeatRef to avoid stale closure issues
    const handleVisibilityChange = () => {
      const currentSeat = mySeatRef.current;
      if (currentSeat === null) return;

      if (document.visibilityState === 'visible') {
        // Cancel any pending disconnect
        if (visibilityDisconnectTimeoutRef.current) {
          clearTimeout(visibilityDisconnectTimeoutRef.current);
          visibilityDisconnectTimeoutRef.current = null;
        }
        // Mark connected immediately
        updatePlayerConnection(roomCode, currentSeat, true);
      } else {
        // Start delayed disconnect - only mark disconnected after 5s
        // This prevents false disconnects from brief interruptions
        visibilityDisconnectTimeoutRef.current = setTimeout(() => {
          const seatAtTimeout = mySeatRef.current;
          if (seatAtTimeout === null) return;
          updatePlayerConnection(roomCode, seatAtTimeout, false);
          visibilityDisconnectTimeoutRef.current = null;
        }, VISIBILITY_DISCONNECT_DELAY_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clear any pending disconnect timeout
      if (visibilityDisconnectTimeoutRef.current) {
        clearTimeout(visibilityDisconnectTimeoutRef.current);
        visibilityDisconnectTimeoutRef.current = null;
      }
      onDisconnectSetupRef.current = false;
      // Cancel onDisconnect handlers when component unmounts normally
      // (we only want them to fire on unexpected disconnects)
      onDisconnect(connectedRef).cancel().catch(() => {});
      onDisconnect(lastSeenRef).cancel().catch(() => {});
    };
  }, [mySeat, roomCode]);

  const join = useCallback(
    async (name: string) => {
      if (!userId) {
        setError('Not authenticated');
        return;
      }

      try {
        setError(null);
        const { seat } = await joinRoom(roomCode, userId, name);
        setMySeat(seat);
        setHasJoined(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        throw err;
      }
    },
    [roomCode, userId]
  );

  const leave = useCallback(async () => {
    if (mySeat === null) return;

    try {
      await leaveRoom(roomCode, mySeat);
      setMySeat(null);
      setHasJoined(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave room');
      throw err;
    }
  }, [roomCode, mySeat]);

  const updateName = useCallback(
    async (name: string) => {
      if (mySeat === null) return;

      try {
        await updatePlayerName(roomCode, mySeat, name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update name');
        throw err;
      }
    },
    [roomCode, mySeat]
  );

  const setDealerSeat = useCallback(
    async (seat: SeatIndex) => {
      try {
        await setDealer(roomCode, seat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set dealer');
        throw err;
      }
    },
    [roomCode]
  );

  const setCallingTimerSeconds = useCallback(
    async (seconds: number | null) => {
      try {
        await setCallingTimer(roomCode, seconds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set timer');
        throw err;
      }
    },
    [roomCode]
  );

  const setTurnTimerSeconds = useCallback(
    async (seconds: number | null) => {
      try {
        await setTurnTimer(roomCode, seconds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set turn timer');
        throw err;
      }
    },
    [roomCode]
  );

  const startGame = useCallback(async () => {
    try {
      await updateRoomStatus(roomCode, 'playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
      throw err;
    }
  }, [roomCode]);

  const kickPlayer = useCallback(
    async (seat: SeatIndex) => {
      try {
        await removePlayer(roomCode, seat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove player');
        throw err;
      }
    },
    [roomCode]
  );

  return {
    room,
    loading,
    error,
    mySeat,
    isHost: room && userId ? checkIsHost(room, userId) : false,
    playerCount: room ? getPlayerCount(room) : 0,
    isFull: room ? isRoomFull(room) : false,
    callingTimerSeconds: room?.settings?.callingTimerSeconds ?? null,
    turnTimerSeconds: room?.settings?.turnTimerSeconds ?? null,
    join,
    leave,
    updateName,
    setDealerSeat,
    setCallingTimerSeconds,
    setTurnTimerSeconds,
    startGame,
    kickPlayer,
  };
}
