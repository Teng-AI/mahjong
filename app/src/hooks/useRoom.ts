import { useEffect, useState, useCallback } from 'react';
import { Room, SeatIndex } from '@/types';
import {
  subscribeToRoom,
  joinRoom,
  leaveRoom,
  removePlayer,
  updatePlayerConnection,
  updatePlayerName,
  setDealer,
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
  join: (name: string) => Promise<void>;
  leave: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setDealerSeat: (seat: SeatIndex) => Promise<void>;
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

  // Update connection status on mount/unmount
  useEffect(() => {
    if (mySeat !== null && roomCode) {
      updatePlayerConnection(roomCode, mySeat, true);

      // Update connection on visibility change
      const handleVisibilityChange = () => {
        if (mySeat !== null) {
          updatePlayerConnection(roomCode, mySeat, !document.hidden);
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Cleanup: mark as disconnected when leaving
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        // Note: We don't mark as disconnected here because
        // the user might just be navigating within the app
      };
    }
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
    join,
    leave,
    updateName,
    setDealerSeat,
    startGame,
    kickPlayer,
  };
}
