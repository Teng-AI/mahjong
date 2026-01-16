import { useEffect, useState, useCallback, useMemo } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '@/firebase/config';
import { GameState, PrivateHand, SeatIndex, TileId, TileType, CallAction, PendingCall, ValidCalls, SessionScores } from '@/types';
import {
  initializeGame,
  needsToDraw,
  drawTile,
  discardTile,
  canWin,
  canWinOnDiscard,
  declareSelfDrawWin,
  declareDiscardWin,
  getNextSeat,
  submitCallResponse,
  declareConcealedKong,
  upgradePungToKong,
  autoPassExpiredTimer,
  autoPlayExpiredTurn,
} from '@/lib/game';
import {
  getValidCalls,
  getValidChowTiles,
  canDeclareConcealedKong,
  canUpgradePungToKong,
} from '@/lib/tiles';

interface UseGameOptions {
  roomCode: string;
  mySeat: SeatIndex | null;
}

interface UseGameReturn {
  gameState: GameState | null;
  myHand: TileId[];
  sessionScores: SessionScores | null;
  loading: boolean;
  error: string | null;
  startGame: (dealerSeat: SeatIndex) => Promise<void>;
  // Phase 5: Turn loop
  shouldDraw: boolean;
  handleDraw: () => Promise<{ success: boolean; wallEmpty?: boolean; threeGoldsWin?: boolean }>;
  handleDiscard: (tileId: TileId) => Promise<{ success: boolean; error?: string }>;
  // Phase 6: Win detection
  canWinNow: boolean;
  canWinOnLastDiscard: boolean;
  handleSelfDrawWin: () => Promise<{ success: boolean; error?: string }>;
  handleDiscardWin: () => Promise<{ success: boolean; error?: string }>;
  // Phase 8: Calling system
  isCallingPhase: boolean;
  myPendingCall: PendingCall | null;
  myValidCalls: ValidCalls | null;
  validChowTiles: Map<TileId, TileId[]>;
  isNextInTurn: boolean;
  handleCallResponse: (action: CallAction, chowTiles?: [TileId, TileId]) => Promise<{ success: boolean; error?: string }>;
  // Calling phase timer
  callingPhaseId: number | undefined;
  callingPhaseStartTime: number | undefined;
  callingTimerSeconds: number | null | undefined;
  handleAutoPass: (expectedPhaseId: number) => Promise<{ success: boolean; error?: string }>;
  // Turn timer
  turnStartTime: number | undefined;
  turnTimerSeconds: number | null | undefined;
  handleAutoPlayTurn: (expectedTurnStartTime: number) => Promise<{ success: boolean; error?: string }>;
  // Kong declarations
  concealedKongOptions: TileType[];
  pungUpgradeOptions: { meldIndex: number; tileFromHand: TileId }[];
  handleConcealedKong: (tileType: TileType) => Promise<{ success: boolean; error?: string }>;
  handlePungUpgrade: (meldIndex: number, tile: TileId) => Promise<{ success: boolean; error?: string }>;
}

export function useGame({ roomCode, mySeat }: UseGameOptions): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myHand, setMyHand] = useState<TileId[]>([]);
  const [sessionScores, setSessionScores] = useState<SessionScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to game state
  useEffect(() => {
    if (!roomCode) {
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => setLoading(false));
      return;
    }

    const gameRef = ref(db, `rooms/${roomCode}/game`);

    onValue(gameRef, (snapshot) => {
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

    onValue(handRef, (snapshot) => {
      if (snapshot.exists()) {
        const hand = snapshot.val() as PrivateHand;
        setMyHand(hand.concealedTiles || []);
      } else {
        setMyHand([]);
      }
    });

    return () => off(handRef);
  }, [roomCode, mySeat]);

  // Subscribe to session scores (cumulative scoring across rounds)
  useEffect(() => {
    if (!roomCode) {
      return;
    }

    const sessionRef = ref(db, `rooms/${roomCode}/session`);

    onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        setSessionScores(snapshot.val() as SessionScores);
      } else {
        setSessionScores(null);
      }
    });

    return () => off(sessionRef);
  }, [roomCode]);

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
  const handleDiscard = useCallback(async (tileId: TileId): Promise<{ success: boolean; error?: string }> => {
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

  // Phase 6: Check if player can win with current hand (self-draw)
  const canWinNow = useMemo(() => {
    if (!gameState || mySeat === null || gameState.phase !== 'playing' || gameState.currentPlayerSeat !== mySeat) {
      return false;
    }
    // If player just called (chow/pung), they already chose not to win - don't show win button
    if (
      gameState.lastAction &&
      (gameState.lastAction.type === 'chow' || gameState.lastAction.type === 'pung') &&
      gameState.lastAction.playerSeat === mySeat
    ) {
      return false;
    }
    const myExposedMelds = gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || [];
    // No hand size check - let canWin validate the winning structure
    return canWin(myHand, gameState.goldTileType, myExposedMelds.length);
  }, [gameState, mySeat, myHand]);

  // Phase 6: Check if player can win on the last discarded tile
  const canWinOnLastDiscard = useMemo(() => {
    // Allow both 'playing' and 'calling' phases - calling is when players can win on a discard
    if (!gameState || mySeat === null || (gameState.phase !== 'playing' && gameState.phase !== 'calling')) {
      return false;
    }
    if (!gameState.lastAction?.tile || gameState.lastAction.type !== 'discard') {
      return false;
    }
    if (gameState.lastAction.playerSeat === mySeat) {
      return false; // Can't win on your own discard
    }
    const myExposedMelds = gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || [];
    // No hand size check - let canWinOnDiscard validate the winning structure
    return canWinOnDiscard(myHand, gameState.lastAction.tile, gameState.goldTileType, myExposedMelds.length);
  }, [gameState, mySeat, myHand]);

  // Phase 6: Declare self-draw win
  const handleSelfDrawWin = useCallback(async () => {
    if (mySeat === null || !gameState) {
      return { success: false, error: 'Invalid state' };
    }

    try {
      setError(null);
      const result = await declareSelfDrawWin(roomCode, mySeat);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to declare win';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [roomCode, mySeat, gameState]);

  // Phase 6: Declare win on discard
  const handleDiscardWin = useCallback(async () => {
    if (
      mySeat === null ||
      !gameState ||
      !gameState.lastAction ||
      gameState.lastAction.type !== 'discard' ||
      !gameState.lastAction.tile
    ) {
      return { success: false, error: 'Invalid state' };
    }

    try {
      setError(null);
      const result = await declareDiscardWin(
        roomCode,
        mySeat,
        gameState.lastAction.tile,
        gameState.lastAction.playerSeat
      );
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to declare win';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [roomCode, mySeat, gameState]);

  // Phase 8: Check if we're in calling phase
  const isCallingPhase = gameState?.phase === 'calling';

  // Phase 8: Get my pending call status
  // Returns null when not in calling phase, 'waiting' when waiting to respond, or the response
  const myPendingCall: PendingCall | null = useMemo(() => {
    if (!gameState || mySeat === null || !gameState.pendingCalls) {
      return null;
    }
    // 'waiting' is the sentinel value for "hasn't responded yet"
    return gameState.pendingCalls[`seat${mySeat}` as keyof typeof gameState.pendingCalls] ?? null;
  }, [gameState, mySeat]);

  // Calling phase timer fields
  const callingPhaseId = gameState?.callingPhaseId;
  const callingPhaseStartTime = gameState?.callingPhaseStartTime;
  const callingTimerSeconds = gameState?.callingTimerSeconds;

  // Auto-pass when timer expires
  const handleAutoPass = useCallback(
    async (expectedPhaseId: number) => {
      if (mySeat === null) {
        return { success: false, error: 'Not in game' };
      }
      try {
        return await autoPassExpiredTimer(roomCode, mySeat, expectedPhaseId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to auto-pass';
        return { success: false, error: errorMsg };
      }
    },
    [roomCode, mySeat]
  );

  // Turn timer fields
  const turnStartTime = gameState?.turnStartTime;
  const turnTimerSeconds = gameState?.turnTimerSeconds;

  // Auto-play turn when turn timer expires
  const handleAutoPlayTurn = useCallback(
    async (expectedTurnStartTime: number) => {
      if (mySeat === null) {
        return { success: false, error: 'Not in game' };
      }
      try {
        return await autoPlayExpiredTurn(roomCode, mySeat, expectedTurnStartTime);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to auto-play turn';
        return { success: false, error: errorMsg };
      }
    },
    [roomCode, mySeat]
  );

  // Phase 8: Check if I'm next in turn (for chow eligibility)
  const isNextInTurn = useMemo(() => {
    if (!gameState || mySeat === null || !gameState.lastAction) {
      return false;
    }
    const discarderSeat = gameState.lastAction.playerSeat;
    return mySeat === getNextSeat(discarderSeat);
  }, [gameState, mySeat]);

  // Phase 8: Calculate valid calls for me
  const myValidCalls: ValidCalls | null = useMemo(() => {
    if (
      !gameState ||
      mySeat === null ||
      gameState.phase !== 'calling' ||
      !gameState.lastAction?.tile ||
      gameState.lastAction.playerSeat === mySeat // Can't call own discard
    ) {
      return null;
    }

    const discardTile = gameState.lastAction.tile;
    const myExposedMelds = gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || [];
    return getValidCalls(myHand, discardTile, gameState.goldTileType, isNextInTurn, myExposedMelds.length);
  }, [gameState, mySeat, myHand, isNextInTurn]);

  // Phase 8: Get valid chow tile combinations
  const validChowTiles: Map<TileId, TileId[]> = useMemo(() => {
    if (
      !gameState ||
      mySeat === null ||
      gameState.phase !== 'calling' ||
      !gameState.lastAction?.tile ||
      !isNextInTurn
    ) {
      return new Map();
    }

    return getValidChowTiles(myHand, gameState.lastAction.tile, gameState.goldTileType);
  }, [gameState, mySeat, myHand, isNextInTurn]);

  // Phase 8: Submit call response
  const handleCallResponse = useCallback(
    async (action: CallAction, chowTiles?: [TileId, TileId]) => {
      if (mySeat === null || !gameState) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        setError(null);
        const result = await submitCallResponse(roomCode, mySeat, action, chowTiles);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to submit call';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [roomCode, mySeat, gameState]
  );

  // Kong: Check if player can declare concealed kong (4 of a kind in hand)
  // Available anytime during your turn before discarding
  const concealedKongOptions: TileType[] = useMemo(() => {
    if (
      !gameState ||
      mySeat === null ||
      gameState.phase !== 'playing' ||
      gameState.currentPlayerSeat !== mySeat
    ) {
      return [];
    }
    return canDeclareConcealedKong(myHand, gameState.goldTileType);
  }, [gameState, mySeat, myHand]);

  // Kong: Check if player can upgrade a pung to kong (returns ALL options)
  // Available anytime during your turn before discarding
  const pungUpgradeOptions: { meldIndex: number; tileFromHand: TileId }[] = useMemo(() => {
    if (
      !gameState ||
      mySeat === null ||
      gameState.phase !== 'playing' ||
      gameState.currentPlayerSeat !== mySeat
    ) {
      return [];
    }
    const myExposedMelds = gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || [];
    return canUpgradePungToKong(myHand, myExposedMelds, gameState.goldTileType);
  }, [gameState, mySeat, myHand]);

  // Kong: Declare concealed kong
  const handleConcealedKong = useCallback(
    async (tileType: TileType) => {
      if (mySeat === null || !gameState) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        setError(null);
        const result = await declareConcealedKong(roomCode, mySeat, tileType);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to declare kong';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [roomCode, mySeat, gameState]
  );

  // Kong: Upgrade pung to kong
  const handlePungUpgrade = useCallback(
    async (meldIndex: number, tile: TileId) => {
      if (mySeat === null || !gameState) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        setError(null);
        const result = await upgradePungToKong(roomCode, mySeat, meldIndex, tile);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to upgrade to kong';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [roomCode, mySeat, gameState]
  );

  return {
    gameState,
    myHand,
    sessionScores,
    loading,
    error,
    startGame,
    // Phase 5
    shouldDraw,
    handleDraw,
    handleDiscard,
    // Phase 6
    canWinNow,
    canWinOnLastDiscard,
    handleSelfDrawWin,
    handleDiscardWin,
    // Phase 8
    isCallingPhase,
    myPendingCall,
    myValidCalls,
    validChowTiles,
    isNextInTurn,
    handleCallResponse,
    // Calling phase timer
    callingPhaseId,
    callingPhaseStartTime,
    callingTimerSeconds,
    handleAutoPass,
    // Turn timer
    turnStartTime,
    turnTimerSeconds,
    handleAutoPlayTurn,
    // Kong declarations
    concealedKongOptions,
    pungUpgradeOptions,
    handleConcealedKong,
    handlePungUpgrade,
  };
}
