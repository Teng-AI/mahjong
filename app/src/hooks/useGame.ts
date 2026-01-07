import { useEffect, useState, useCallback } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '@/firebase/config';
import { GameState, PrivateHand, SeatIndex, TileId } from '@/types';
import {
  initializeGame,
  exposeBonusTiles,
  advanceBonusExposure,
  needsToDraw,
  drawTile,
  discardTile,
} from '@/lib/game';

interface UseGameOptions {
  roomCode: string;
  mySeat: SeatIndex | null;
}

interface UseGameReturn {
  gameState: GameState | null;
  myHand: TileId[];
  loading: boolean;
  error: string | null;
  startGame: (dealerSeat: SeatIndex) => Promise<void>;
  processBonusExposure: () => Promise<void>;
  // Phase 5: Turn loop
  shouldDraw: boolean;
  handleDraw: () => Promise<{ success: boolean; wallEmpty?: boolean; threeGoldsWin?: boolean }>;
  handleDiscard: (tileId: TileId) => Promise<{ success: boolean }>;
}

export function useGame({ roomCode, mySeat }: UseGameOptions): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myHand, setMyHand] = useState<TileId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to game state
  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      return;
    }

    const gameRef = ref(db, `rooms/${roomCode}/game`);

    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        setGameState(snapshot.val() as GameState);
      } else {
        setGameState(null);
      }
      setLoading(false);
    });

    return () => off(gameRef);
  }, [roomCode]);

  // Subscribe to private hand
  useEffect(() => {
    if (!roomCode || mySeat === null) {
      return;
    }

    const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${mySeat}`);

    const unsubscribe = onValue(handRef, (snapshot) => {
      if (snapshot.exists()) {
        const hand = snapshot.val() as PrivateHand;
        setMyHand(hand.concealedTiles || []);
      } else {
        setMyHand([]);
      }
    });

    return () => off(handRef);
  }, [roomCode, mySeat]);

  // Start game (host only)
  const startGame = useCallback(
    async (dealerSeat: SeatIndex) => {
      try {
        setError(null);
        await initializeGame(roomCode, dealerSeat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start game');
        throw err;
      }
    },
    [roomCode]
  );

  // Process bonus tile exposure for current player
  const processBonusExposure = useCallback(async () => {
    if (mySeat === null || !gameState) return;

    try {
      setError(null);

      // Expose all bonus tiles from my hand
      const result = await exposeBonusTiles(roomCode, mySeat);

      if (result.wallEmpty) {
        // Game ends in draw
        return;
      }

      // Advance to next player or reveal Gold
      await advanceBonusExposure(roomCode, mySeat, gameState.dealerSeat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process bonus tiles');
      throw err;
    }
  }, [roomCode, mySeat, gameState]);

  // Phase 5: Check if current player needs to draw
  const shouldDraw = gameState && mySeat !== null && gameState.currentPlayerSeat === mySeat
    ? needsToDraw(gameState)
    : false;

  // Phase 5: Draw a tile
  const handleDraw = useCallback(async () => {
    if (mySeat === null || !gameState) {
      return { success: false };
    }

    try {
      setError(null);
      const result = await drawTile(roomCode, mySeat);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draw tile');
      throw err;
    }
  }, [roomCode, mySeat, gameState]);

  // Phase 5: Discard a tile
  const handleDiscard = useCallback(async (tileId: TileId) => {
    if (mySeat === null || !gameState) {
      return { success: false };
    }

    try {
      setError(null);
      const result = await discardTile(roomCode, mySeat, tileId);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard tile');
      throw err;
    }
  }, [roomCode, mySeat, gameState]);

  return {
    gameState,
    myHand,
    loading,
    error,
    startGame,
    processBonusExposure,
    // Phase 5
    shouldDraw,
    handleDraw,
    handleDiscard,
  };
}
