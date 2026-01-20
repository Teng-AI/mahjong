'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { useGame } from '@/hooks/useGame';
import { useBotRunner } from '@/hooks/useBotRunner';
import { useSounds } from '@/hooks/useSounds';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCallingTimer } from '@/hooks/useCallingTimer';
import { useTurnTimer } from '@/hooks/useTurnTimer';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { getTileType, getTileDisplayText, isGoldTile, sortTilesForDisplay } from '@/lib/tiles';
import { needsToDraw, adjustCumulativeScores, abortGame, setReadyForNextRound, initializeReadyState } from '@/lib/game';
import { calculateSettlement, calculateNetPositions } from '@/lib/settle';
import { ScoreEditModal } from '@/components/ScoreEditModal';
import { SettingsModal } from '@/components/SettingsModal';
import { TurnIndicator } from '@/components/TurnIndicator';
import { RulesModal } from '@/components/RulesModal';
import { Tile, Hand } from '@/components/tiles';
import { GameHeader, GameLog, MobileActionBar, DiscardPile } from '@/components/game';
import { SeatIndex, TileId, TileType, CallAction, Room, WinnerInfo, ScoreBreakdown, CALL_DISPLAY_NAMES } from '@/types';
import { ref, update } from 'firebase/database';
import { db } from '@/firebase/config';

// Debug logging - only enabled in development
const DEBUG_GAME = false; // Set to true to enable debug panel and logging

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;

// Helper to get player name by seat, with fallback to direction
function getPlayerName(room: Room | null, seat: SeatIndex): string {
  return room?.players?.[`seat${seat}` as keyof Room['players']]?.name || SEAT_LABELS[seat];
}

// Helper to transform action log entry, replacing direction names with player names
function transformLogEntry(entry: string, room: Room | null, mySeat: SeatIndex | null): string {
  if (!room) return entry;

  let transformed = entry;

  // Handle private information (e.g., drawn tiles only visible to the player who drew)
  // Format: "East drew a tile [PRIVATE:0:7竹]"
  const privateMatch = transformed.match(/\[PRIVATE:(\d):([^\]]+)\]/);
  if (privateMatch) {
    const privateSeat = parseInt(privateMatch[1]) as SeatIndex;
    const privateInfo = privateMatch[2];
    if (mySeat === privateSeat) {
      // Show the private info to the player who drew
      transformed = transformed.replace(/ \[PRIVATE:\d:[^\]]+\]/, `: ${privateInfo}`);
    } else {
      // Hide the private info from other players
      transformed = transformed.replace(/ \[PRIVATE:\d:[^\]]+\]/, '');
    }
  }

  // Replace direction names with player names
  SEAT_LABELS.forEach((direction, index) => {
    const playerName = getPlayerName(room, index as SeatIndex);
    // Use word boundary to avoid partial replacements
    const regex = new RegExp(`\\b${direction}\\b`, 'g');
    transformed = transformed.replace(regex, playerName);
  });

  // Also replace "Dealer" with the actual dealer's name if applicable
  return transformed;
}

// ============================================
// MAIN GAME PAGE
// ============================================

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = (params.code as string).toUpperCase();

  // Allow seat override via URL param for testing (e.g., ?seat=0)
  const seatOverride = searchParams.get('seat');

  const { user, loading: authLoading } = useAuth();
  const {
    room,
    loading: roomLoading,
    mySeat: actualSeat,
    isHost,
    callingTimerSeconds: roomCallingTimerSeconds,
    setCallingTimerSeconds,
    turnTimerSeconds: roomTurnTimerSeconds,
    setTurnTimerSeconds,
  } = useRoom({
    roomCode,
    userId: user?.uid || null,
  });

  // Use seat override if provided, otherwise use actual seat
  const mySeat = seatOverride !== null ? (parseInt(seatOverride) as SeatIndex) : actualSeat;

  const {
    gameState,
    myHand,
    sessionScores,
    loading: gameLoading,
    startGame,
    shouldDraw,
    handleDraw,
    handleDiscard,
    // Phase 6: Win detection
    canWinNow,
    handleSelfDrawWin,
    // Phase 8: Calling system
    isCallingPhase,
    myPendingCall,
    myValidCalls,
    validChowTiles,
    handleCallResponse,
    // Kong declarations
    concealedKongOptions,
    pungUpgradeOptions,
    handleConcealedKong,
    handlePungUpgrade,
    // Calling phase timer
    callingPhaseId,
    callingPhaseStartTime,
    callingTimerSeconds,
    handleAutoPass,
    // Turn timer
    turnStartTime,
    turnTimerSeconds,
    handleAutoPlayTurn,
  } = useGame({
    roomCode,
    mySeat,
  });

  // Run AI bots for any bot players in the room
  useBotRunner({
    roomCode,
    room,
    gameState,
    enabled: true,
    botDelay: 800, // 800ms delay for bot actions
  });

  // Sound effects
  const { playSound, soundEnabled, toggleSound, volume, setVolume } = useSounds();

  // Determine if player has already responded during calling phase
  const hasRespondedToCalling = myPendingCall !== null && myPendingCall !== 'waiting';

  // Calling phase timer
  const onTimerExpire = useCallback(async (phaseId: number) => {
    if (mySeat === null) return;
    await handleAutoPass(phaseId);
  }, [mySeat, handleAutoPass]);

  const {
    remainingSeconds: timerRemainingSeconds,
    isWarning: timerIsWarning,
  } = useCallingTimer({
    startTime: callingPhaseStartTime,
    totalSeconds: callingTimerSeconds,
    phaseId: callingPhaseId,
    isCallingPhase,
    hasResponded: hasRespondedToCalling,
    onExpire: onTimerExpire,
  });

  // Track if warning sound has been played for current phase
  const warningSoundPlayedRef = useRef<number | null>(null);

  // Play warning sound when timer enters warning zone (once per phase)
  useEffect(() => {
    if (
      timerIsWarning &&
      !hasRespondedToCalling &&
      callingPhaseId !== undefined &&
      warningSoundPlayedRef.current !== callingPhaseId
    ) {
      warningSoundPlayedRef.current = callingPhaseId;
      playSound('timerWarning');
    }
  }, [timerIsWarning, hasRespondedToCalling, callingPhaseId, playSound]);

  // Reset warning sound tracking when phase changes
  useEffect(() => {
    if (!isCallingPhase) {
      warningSoundPlayedRef.current = null;
    }
  }, [isCallingPhase]);

  // Determine if it's my turn (for turn timer)
  const isMyTurn = gameState?.phase === 'playing' && gameState?.currentPlayerSeat === mySeat;
  const isPlayingPhase = gameState?.phase === 'playing';

  // Turn timer callback
  const onTurnTimerExpire = useCallback(async (turnStart: number) => {
    if (mySeat === null) return;
    await handleAutoPlayTurn(turnStart);
  }, [mySeat, handleAutoPlayTurn]);

  const {
    remainingSeconds: turnTimerRemainingSeconds,
    isWarning: turnTimerIsWarning,
  } = useTurnTimer({
    startTime: turnStartTime,
    totalSeconds: turnTimerSeconds,
    isMyTurn: !!isMyTurn,
    isPlayingPhase: !!isPlayingPhase,
    onExpire: onTurnTimerExpire,
  });

  // Track if turn warning sound has been played for current turn
  const turnWarningSoundPlayedRef = useRef<number | null>(null);

  // Play warning sound when turn timer enters warning zone (once per turn)
  useEffect(() => {
    if (
      turnTimerIsWarning &&
      isMyTurn &&
      turnStartTime !== undefined &&
      turnWarningSoundPlayedRef.current !== turnStartTime
    ) {
      turnWarningSoundPlayedRef.current = turnStartTime;
      playSound('timerWarning');
    }
  }, [turnTimerIsWarning, isMyTurn, turnStartTime, playSound]);

  // Reset turn warning sound tracking when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      turnWarningSoundPlayedRef.current = null;
    }
  }, [isMyTurn]);

  // Keyboard shortcuts
  const { shortcuts, setShortcut, resetToDefaults } = useKeyboardShortcuts();
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showScoreEdit, setShowScoreEdit] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Phase 8: Chow selection mode
  const [chowSelectionMode, setChowSelectionMode] = useState(false);
  const [selectedChowTiles, setSelectedChowTiles] = useState<TileId[]>([]);
  const [focusedChowTileIndex, setFocusedChowTileIndex] = useState(0);


  // Kong: Unified kong selection mode (for keyboard navigation)
  const [kongSelectionMode, setKongSelectionMode] = useState(false);
  const [focusedKongIndex, setFocusedKongIndex] = useState(0);

  // Combined kong options for keyboard navigation
  type KongOption =
    | { type: 'concealed'; tileType: TileType }
    | { type: 'upgrade'; meldIndex: number; tileFromHand: TileId; tileType: TileType };

  const combinedKongOptions: KongOption[] = useMemo(() => {
    const options: KongOption[] = [];
    // Add concealed kong options
    for (const tileType of concealedKongOptions) {
      options.push({ type: 'concealed', tileType });
    }
    // Add pung upgrade options
    for (const opt of pungUpgradeOptions) {
      const tileType = getTileType(opt.tileFromHand);
      options.push({ type: 'upgrade', meldIndex: opt.meldIndex, tileFromHand: opt.tileFromHand, tileType });
    }
    return options;
  }, [concealedKongOptions, pungUpgradeOptions]);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Game log tabs and pagination
  const [logTab, setLogTab] = useState<'log' | 'summary'>('log');
  const [viewingRound, setViewingRound] = useState<number | null>(null); // null = current game

  // Debug: looping sound state
  const [loopingSound, setLoopingSound] = useState<string | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const toggleLoopSound = (soundType: string) => {
    // Stop current loop if any
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }

    // If clicking same sound, just stop
    if (loopingSound === soundType) {
      setLoopingSound(null);
      return;
    }

    // Start new loop
    setLoopingSound(soundType);
    playSound(soundType as Parameters<typeof playSound>[0]);
    loopIntervalRef.current = setInterval(() => {
      playSound(soundType as Parameters<typeof playSound>[0]);
    }, 1500);
  };

  // Winner reveal suspense state
  const [showWinnerSuspense, setShowWinnerSuspense] = useState(false);
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  // Suspense animation phases: 'faceDown' -> 'flipping' -> 'flyIn' -> 'fading'
  const [suspensePhase, setSuspensePhase] = useState<'faceDown' | 'flipping' | 'flyIn' | 'fading'>('faceDown');

  // Toast message for errors
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Clear selected tile when it's no longer player's turn to discard
  const isMyTurnToDiscard = isMyTurn && !shouldDraw && gameState?.phase === 'playing';
  useEffect(() => {
    if (!isMyTurnToDiscard) {
      setSelectedTile(null);
    }
  }, [isMyTurnToDiscard]);

  // Track discarders for turn indicator
  // Green box = current actor (whose turn it is), Grey box = previous discarder
  const [lastDiscarder, setLastDiscarder] = useState<SeatIndex | null>(null);
  const [previousDiscarder, setPreviousDiscarder] = useState<SeatIndex | null>(null);
  useEffect(() => {
    if (gameState?.lastAction?.type === 'discard') {
      const newDiscarder = gameState.lastAction.playerSeat;
      // Only update if it's a different discarder
      if (newDiscarder !== lastDiscarder) {
        setPreviousDiscarder(lastDiscarder);
        setLastDiscarder(newDiscarder);
      }
    }
  }, [gameState?.lastAction, lastDiscarder]);

  // Determine current actor and previous actor for turn indicator
  // Green box (currentActor): who is acting right now
  // Grey box (previousActor): who acted just before them
  const currentActor = gameState?.phase === 'calling'
    ? lastDiscarder  // During calling: last discarder is still acting
    : gameState?.currentPlayerSeat ?? null;  // During playing: current player's turn

  // Previous actor changes based on phase:
  // - Playing phase: the last discarder (their discard triggered current player's turn)
  // - Calling phase: the discarder before the last one
  const previousActor = gameState?.phase === 'calling'
    ? previousDiscarder
    : lastDiscarder;

  // Scroll to top when new round starts (phase changes from 'ended')
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    const currentPhase = gameState?.phase;
    if (prevPhaseRef.current === 'ended' && currentPhase && currentPhase !== 'ended') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    prevPhaseRef.current = currentPhase ?? null;
  }, [gameState?.phase]);

  // Trigger winner suspense when game ends with a winner
  useEffect(() => {
    if (gameState?.phase === 'ended' && gameState?.winner && !winnerRevealed) {
      // Start suspense - phase 1: face down tiles
      setShowWinnerSuspense(true);
      setSuspensePhase('faceDown');
      playSound('drumroll');

      // Phase 2: flip tiles (after 700ms)
      const flipTimer = setTimeout(() => {
        setSuspensePhase('flipping');
      }, 700);

      // Phase 3: fly-in winning tile (after 1.7s)
      const flyInTimer = setTimeout(() => {
        setSuspensePhase('flyIn');
      }, 1700);

      // Phase 4: fade to winning page (after 2.7s)
      const fadeTimer = setTimeout(() => {
        setSuspensePhase('fading');
      }, 2700);

      // Complete reveal (after 3.2s)
      const revealTimer = setTimeout(() => {
        setShowWinnerSuspense(false);
        setWinnerRevealed(true);
      }, 3200);

      return () => {
        clearTimeout(flipTimer);
        clearTimeout(flyInTimer);
        clearTimeout(fadeTimer);
        clearTimeout(revealTimer);
      };
    }
    // Reset when game restarts
    if (gameState?.phase !== 'ended') {
      setWinnerRevealed(false);
      setShowWinnerSuspense(false);
      setSuspensePhase('faceDown');
    }
  }, [gameState?.phase, gameState?.winner, winnerRevealed, playSound]);

  // Play win sound on loop for the winner when game ends (only if sound enabled)
  useEffect(() => {
    if (!soundEnabled) return; // Don't play if sound is disabled
    // Only play after suspense is done
    if (gameState?.phase === 'ended' && gameState?.winner && gameState.winner.seat === mySeat && winnerRevealed) {
      // Play immediately
      playSound('win');
      // Loop every 3 seconds (duration of the fanfare is ~2.5s)
      const interval = setInterval(() => {
        playSound('win');
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [gameState?.phase, gameState?.winner, mySeat, playSound, soundEnabled, winnerRevealed]);

  // Initialize ready state when game ends (host only, to avoid race conditions)
  useEffect(() => {
    if (gameState?.phase === 'ended' && isHost && !room?.readyForNextRound) {
      initializeReadyState(roomCode);
    }
  }, [gameState?.phase, isHost, room?.readyForNextRound, roomCode]);

  // Ready state for next round
  const readyState = room?.readyForNextRound;
  const myReadyState = mySeat !== null && readyState ? readyState[`seat${mySeat}` as keyof typeof readyState] : false;
  const readyCount = readyState
    ? ([0, 1, 2, 3] as SeatIndex[]).filter(seat => {
        const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
        return player && readyState[`seat${seat}` as keyof typeof readyState];
      }).length
    : 0;
  const totalPlayers = room?.players
    ? ([0, 1, 2, 3] as SeatIndex[]).filter(seat =>
        room.players[`seat${seat}` as keyof typeof room.players] !== null
      ).length
    : 0;
  const allReady = readyCount === totalPlayers && totalPlayers > 0;

  // Game log pagination
  const totalRounds = sessionScores?.rounds?.length || 0;
  const currentRoundNumber = totalRounds + 1; // Current game is next round
  const gameLogs = sessionScores?.gameLogs || {};

  // Get log entries for the viewing round (or current game if null)
  const getLogForRound = (roundNum: number | null): string[] => {
    if (roundNum === null) {
      // Current game - use live actionLog
      return gameState?.actionLog || [];
    }
    // Archived game
    return gameLogs[roundNum] || [];
  };

  const displayedLog = getLogForRound(viewingRound);
  const displayedRoundNumber = viewingRound ?? currentRoundNumber;
  const canGoPrev = displayedRoundNumber > 1;
  const canGoNext = viewingRound !== null; // Can go next if viewing archived (to get back to current)

  // Pagination handlers
  const goToPrevRound = () => {
    if (viewingRound === null) {
      // Currently viewing current game, go to last archived
      if (totalRounds > 0) {
        setViewingRound(totalRounds);
      }
    } else if (viewingRound > 1) {
      setViewingRound(viewingRound - 1);
    }
  };

  const goToNextRound = () => {
    if (viewingRound !== null) {
      if (viewingRound < totalRounds) {
        setViewingRound(viewingRound + 1);
      } else {
        // Go back to current game
        setViewingRound(null);
      }
    }
  };

  // Handle toggling ready state
  const handleToggleReady = async () => {
    if (mySeat === null) return;
    await setReadyForNextRound(roomCode, mySeat, !myReadyState);
  };

  // Handle drawing a tile
  const onDraw = async () => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleDraw();
      playSound('draw');
      if (result.wallEmpty) {
        if (DEBUG_GAME) console.log('Wall exhausted - game ends in draw');
      }
      if (result.threeGoldsWin) {
        // Win sound will play after suspense reveal
        if (DEBUG_GAME) console.log('Three Golds! You win!');
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Draw failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Auto-select the just-drawn tile for discard
  useEffect(() => {
    const isMyTurnToDiscard = gameState?.phase === 'playing' &&
      gameState?.currentPlayerSeat === mySeat &&
      !shouldDraw;

    const lastAction = gameState?.lastAction;
    const isNormalDraw = lastAction?.type === 'draw' && lastAction?.tile;
    const isKongReplacement = lastAction?.type === 'kong' && lastAction?.replacementTile;

    if (isMyTurnToDiscard && lastAction?.playerSeat === mySeat && (isNormalDraw || isKongReplacement)) {
      // Don't auto-select gold tiles (can't be discarded)
      const drawnTile = isKongReplacement ? lastAction.replacementTile! : lastAction.tile!;
      if (!gameState.goldTileType || !isGoldTile(drawnTile, gameState.goldTileType)) {
        setSelectedTile(drawnTile);
      }
    }
  }, [gameState?.phase, gameState?.currentPlayerSeat, mySeat, shouldDraw, gameState?.lastAction, gameState?.goldTileType]);

  // Handle discarding a tile
  const onDiscard = async () => {
    if (processingAction || !selectedTile) return;

    setProcessingAction(true);
    try {
      const result = await handleDiscard(selectedTile);
      if (result.success) {
        playSound('discard');
        setSelectedTile(null); // Clear selection after successful discard
      } else if (result.error) {
        setToastMessage(result.error);
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Discard failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle tile click for selection (only during discard phase)
  // Gold tiles cannot be discarded - they must be kept
  const onTileClick = (tile: TileId) => {
    if (!isMyTurn || shouldDraw || gameState?.phase !== 'playing') return;
    // Gold tiles cannot be selected for discard
    if (gameState?.goldTileType && isGoldTile(tile, gameState.goldTileType)) return;

    playSound(selectedTile === tile ? 'tileClick' : 'tileSelect');
    setSelectedTile(selectedTile === tile ? null : tile);
  };

  // Handle declaring a self-draw win
  const onDeclareWin = async () => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleSelfDrawWin();
      if (result.success) {
        // Win sound will play after suspense reveal
      } else {
        if (DEBUG_GAME) console.error('Win declaration failed:', result.error);
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Win declaration failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Phase 8: Handle call response (Win, Pung, Pass)
  const onCallResponse = async (action: CallAction) => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleCallResponse(action);
      if (result.success) {
        // Play appropriate sound for the action
        // Win sound will play after suspense reveal
        if (action === 'pung') playSound('pung');
        else if (action === 'pass') playSound('pass');
      } else {
        if (DEBUG_GAME) console.error('Call response failed:', result.error);
      }
      // Reset chow selection state
      setChowSelectionMode(false);
      setSelectedChowTiles([]);
    } catch (err) {
      if (DEBUG_GAME) console.error('Call response failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Phase 8: Enter chow selection mode
  const onChowClick = () => {
    setChowSelectionMode(true);
    setSelectedChowTiles([]);
    setFocusedChowTileIndex(0);
  };

  // Keyboard shortcut handler for game actions
  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      // Ignore if typing in input field or settings modal is open
      if (e.target instanceof HTMLInputElement || showSettings) return;
      // Don't fire if already processing an action
      if (processingAction) return;

      const key = e.key.toUpperCase();
      const isCurrentPlayersTurn = gameState?.currentPlayerSeat === mySeat;
      const isDiscardPhase = gameState?.phase === 'playing' && isCurrentPlayersTurn && !shouldDraw;

      // Draw shortcut (Space) - during playing phase when it's my turn and I need to draw
      if (e.key === ' ' && gameState?.phase === 'playing' && isCurrentPlayersTurn && shouldDraw) {
        e.preventDefault();
        onDraw();
        return;
      }

      // Self-draw win shortcut - during discard phase when you can win
      if (key === shortcuts.win && isDiscardPhase && canWinNow) {
        e.preventDefault();
        onDeclareWin();
        return;
      }

      // Tile selection with arrow keys (during discard phase, not in kong selection)
      if (isDiscardPhase && myHand.length > 0 && !kongSelectionMode) {
        // Filter out gold tiles (can't be discarded)
        const discardableTiles = myHand.filter(tile =>
          !gameState?.goldTileType || !isGoldTile(tile, gameState.goldTileType)
        );

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const currentIndex = selectedTile ? discardableTiles.indexOf(selectedTile) : -1;
          let newIndex: number;

          if (e.key === 'ArrowRight') {
            newIndex = currentIndex < discardableTiles.length - 1 ? currentIndex + 1 : 0;
          } else {
            newIndex = currentIndex > 0 ? currentIndex - 1 : discardableTiles.length - 1;
          }

          const newTile = discardableTiles[newIndex];
          if (newTile) {
            setSelectedTile(newTile);
            playSound('tileSelect');
          }
          return;
        }

        // Enter to discard selected tile
        if (e.key === 'Enter' && selectedTile) {
          e.preventDefault();
          onDiscard();
          return;
        }

        // Escape to cancel selection
        if (e.key === 'Escape' && selectedTile) {
          e.preventDefault();
          setSelectedTile(null);
          return;
        }

        // Number keys 1-9, 0 for quick tile selection (1=first, 0=10th)
        const numKey = e.key === '0' ? 10 : parseInt(e.key);
        if (!isNaN(numKey) && numKey >= 1 && numKey <= 10) {
          const tileIndex = numKey - 1;
          if (tileIndex < discardableTiles.length) {
            e.preventDefault();
            setSelectedTile(discardableTiles[tileIndex]);
            playSound('tileSelect');
          }
          return;
        }
      }

      // Chow selection mode keyboard navigation
      if (chowSelectionMode && isCallingPhase) {
        // Get the list of valid tiles to navigate
        const validTiles: TileId[] = selectedChowTiles.length === 0
          ? Array.from(validChowTiles.keys()) // First tile: all keys in the map
          : validChowTiles.get(selectedChowTiles[0]) || []; // Second tile: values for selected first tile

        // Arrow keys to navigate through valid tiles
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (validTiles.length > 0) {
            let newIndex: number;
            if (e.key === 'ArrowRight') {
              newIndex = focusedChowTileIndex < validTiles.length - 1 ? focusedChowTileIndex + 1 : 0;
            } else {
              newIndex = focusedChowTileIndex > 0 ? focusedChowTileIndex - 1 : validTiles.length - 1;
            }
            setFocusedChowTileIndex(newIndex);
            playSound('tileSelect');
          }
          return;
        }

        // Space to select the focused tile
        if (e.key === ' ') {
          e.preventDefault();
          const focusedTile = validTiles[focusedChowTileIndex];
          if (focusedTile) {
            onChowTileClick(focusedTile);
            setFocusedChowTileIndex(0); // Reset focus for next selection
          }
          return;
        }

        // Enter to confirm chow (when 2 tiles selected)
        if (e.key === 'Enter' && selectedChowTiles.length === 2) {
          e.preventDefault();
          onConfirmChow();
          return;
        }

        // Escape to cancel chow selection
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelChow();
          return;
        }

        return; // Don't process other shortcuts during chow selection
      }

      // Kong selection mode keyboard navigation
      if (kongSelectionMode && isDiscardPhase) {
        // Arrow keys to navigate through kong options
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (combinedKongOptions.length > 0) {
            let newIndex: number;
            if (e.key === 'ArrowRight') {
              newIndex = focusedKongIndex < combinedKongOptions.length - 1 ? focusedKongIndex + 1 : 0;
            } else {
              newIndex = focusedKongIndex > 0 ? focusedKongIndex - 1 : combinedKongOptions.length - 1;
            }
            setFocusedKongIndex(newIndex);
            playSound('tileSelect');
          }
          return;
        }

        // Enter to confirm the focused kong option
        if (e.key === 'Enter') {
          e.preventDefault();
          const focusedOption = combinedKongOptions[focusedKongIndex];
          if (focusedOption) {
            executeKongOption(focusedOption);
          }
          return;
        }

        // Escape to cancel kong selection
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelKongSelection();
          return;
        }

        return; // Don't process other shortcuts during kong selection
      }

      // K key to trigger kong during discard phase (your turn)
      if (key === shortcuts.kong && isDiscardPhase && combinedKongOptions.length > 0 && !kongSelectionMode) {
        e.preventDefault();
        onKongKeyPress();
        return;
      }

      // Calling phase shortcuts
      if (!isCallingPhase || myPendingCall !== 'waiting' || chowSelectionMode) return;

      if (key === shortcuts.win && myValidCalls?.canWin) {
        e.preventDefault();
        onCallResponse('win');
      } else if (key === shortcuts.kong && myValidCalls?.canKong) {
        e.preventDefault();
        onCallResponse('kong');
      } else if (key === shortcuts.pung && myValidCalls?.canPung) {
        e.preventDefault();
        onCallResponse('pung');
      } else if (key === shortcuts.chow && myValidCalls?.canChow) {
        e.preventDefault();
        onChowClick();
      } else if (e.key === ' ') {
        // Space = Pass (the "default action" key)
        e.preventDefault();
        onCallResponse('pass');
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
    // onCallResponse, onChowClick, onChowTileClick, onCancelChow, onDraw, onDiscard, onDeclareWin, onKongKeyPress, executeKongOption, onCancelKongSelection are intentionally excluded - they're not memoized and would cause unnecessary re-registrations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallingPhase, myPendingCall, chowSelectionMode, processingAction, shortcuts, myValidCalls, showSettings, gameState?.phase, gameState?.currentPlayerSeat, mySeat, shouldDraw, myHand, selectedTile, gameState?.goldTileType, selectedChowTiles, validChowTiles, focusedChowTileIndex, canWinNow, kongSelectionMode, focusedKongIndex, combinedKongOptions]);

  // Phase 8: Cancel chow selection
  const onCancelChow = () => {
    setChowSelectionMode(false);
    setSelectedChowTiles([]);
    setFocusedChowTileIndex(0);
  };

  // Phase 8: Handle tile click during chow selection
  const onChowTileClick = (tile: TileId) => {
    if (selectedChowTiles.length === 0) {
      // First tile selection
      if (validChowTiles.has(tile)) {
        setSelectedChowTiles([tile]);
      }
    } else if (selectedChowTiles.length === 1) {
      // Second tile selection
      const validSecondTiles = validChowTiles.get(selectedChowTiles[0]) || [];
      if (validSecondTiles.includes(tile)) {
        setSelectedChowTiles([selectedChowTiles[0], tile]);
      } else if (tile === selectedChowTiles[0]) {
        // Clicked same tile - deselect
        setSelectedChowTiles([]);
      } else if (validChowTiles.has(tile)) {
        // Clicked a different valid first tile - restart
        setSelectedChowTiles([tile]);
      }
    } else {
      // Already have 2 tiles selected
      if (tile === selectedChowTiles[1]) {
        // Clicked second tile - deselect it, keep first
        setSelectedChowTiles([selectedChowTiles[0]]);
      } else if (tile === selectedChowTiles[0]) {
        // Clicked first tile - reset selection entirely
        setSelectedChowTiles([]);
      } else if (validChowTiles.has(tile)) {
        // Clicked a different valid first tile - restart with that tile
        setSelectedChowTiles([tile]);
      }
    }
  };

  // Phase 8: Confirm chow selection
  const onConfirmChow = async () => {
    if (selectedChowTiles.length !== 2 || processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleCallResponse('chow', selectedChowTiles as [TileId, TileId]);
      if (result.success) {
        playSound('chow');
      } else {
        if (DEBUG_GAME) console.error('Chow failed:', result.error);
      }
      setChowSelectionMode(false);
      setSelectedChowTiles([]);
    } catch (err) {
      if (DEBUG_GAME) console.error('Chow failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Reset chow selection when leaving calling phase
  useEffect(() => {
    if (!isCallingPhase) {
      setChowSelectionMode(false);
      setSelectedChowTiles([]);
    }
  }, [isCallingPhase]);

  // Reset kong selection mode when options disappear or turn changes
  useEffect(() => {
    const isCurrentlyMyTurn = gameState?.currentPlayerSeat === mySeat;
    if (combinedKongOptions.length === 0 || !isCurrentlyMyTurn || gameState?.phase !== 'playing') {
      setKongSelectionMode(false);
      setFocusedKongIndex(0);
    }
  }, [combinedKongOptions.length, gameState?.currentPlayerSeat, mySeat, gameState?.phase]);

  // Kong: Enter kong selection mode or execute single option
  const onKongKeyPress = () => {
    if (combinedKongOptions.length === 0) return;

    if (combinedKongOptions.length === 1) {
      // Single option - execute immediately
      executeKongOption(combinedKongOptions[0]);
    } else {
      // Multiple options - enter selection mode
      setKongSelectionMode(true);
      setFocusedKongIndex(0);
    }
  };

  // Kong: Execute a specific kong option
  const executeKongOption = async (option: KongOption) => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      if (option.type === 'concealed') {
        const result = await handleConcealedKong(option.tileType);
        if (result.success) {
          playSound('pung');
        } else {
          setToastMessage(result.error || 'Failed to declare kong');
        }
      } else {
        const result = await handlePungUpgrade(option.meldIndex, option.tileFromHand);
        if (result.success) {
          playSound('pung');
        } else {
          setToastMessage(result.error || 'Failed to upgrade to kong');
        }
      }
      setKongSelectionMode(false);
      setFocusedKongIndex(0);
    } catch (err) {
      if (DEBUG_GAME) console.error('Kong failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Kong: Cancel kong selection mode
  const onCancelKongSelection = () => {
    setKongSelectionMode(false);
    setFocusedKongIndex(0);
  };

  // DEBUG: Trigger test wins (dev mode only)
  const triggerTestWin = async (winType: 'normal' | 'threeGolds' | 'robbingGold' | 'selfDraw') => {
    if (!DEBUG_GAME || !gameState || mySeat === null) return;

    // Get the gold tile type from the current game
    const goldType = gameState.goldTileType || 'dots_9';
    const goldSuit = goldType.split('_')[0]; // 'dots', 'bamboo', or 'characters'
    const goldNum = parseInt(goldType.split('_')[1]);

    // Get two suits that are NOT the gold suit (to avoid conflicts)
    const allSuits = ['dots', 'bamboo', 'characters'];
    const safeSuits = allSuits.filter(s => s !== goldSuit);
    const suit1 = safeSuits[0]; // First safe suit
    const suit2 = safeSuits[1]; // Second safe suit

    // Build unique 17-tile winning hands for each win type
    // IMPORTANT: Only use tiles from suits that are NOT the gold suit
    let fakeHand: TileId[];
    let winningTile: TileId;
    let goldCount = 0;

    if (winType === 'normal') {
      // Normal win: someone discarded the tile you needed
      // Hand with 2 golds, winning tile is the called discard
      fakeHand = [
        // 2 gold tiles
        `${goldSuit}_${goldNum}_0` as TileId,
        `${goldSuit}_${goldNum}_1` as TileId,
        // Pung (suit1)
        `${suit1}_3_0` as TileId, `${suit1}_3_1` as TileId, `${suit1}_3_2` as TileId,
        // Chow (suit2) 1-2-3
        `${suit2}_1_0` as TileId, `${suit2}_2_0` as TileId, `${suit2}_3_0` as TileId,
        // Pung (suit1)
        `${suit1}_5_0` as TileId, `${suit1}_5_1` as TileId, `${suit1}_5_2` as TileId,
        // Chow (suit2) 4-5-6
        `${suit2}_4_0` as TileId, `${suit2}_5_0` as TileId, `${suit2}_6_0` as TileId,
        // Pair waiting for pung (suit1)
        `${suit1}_7_0` as TileId, `${suit1}_7_1` as TileId,
        // Winning tile: the discarded tile that completed the pung
        `${suit1}_7_2` as TileId,
      ];
      winningTile = `${suit1}_7_2` as TileId;
      goldCount = 2;
    } else if (winType === 'selfDraw') {
      // Self-draw: you drew the winning tile yourself
      // Hand with 2 golds, winning tile is the drawn tile
      fakeHand = [
        // 2 gold tiles
        `${goldSuit}_${goldNum}_0` as TileId,
        `${goldSuit}_${goldNum}_1` as TileId,
        // Pung (suit1)
        `${suit1}_1_0` as TileId, `${suit1}_1_1` as TileId, `${suit1}_1_2` as TileId,
        // Chow (suit2) 4-5-6
        `${suit2}_4_0` as TileId, `${suit2}_5_0` as TileId, `${suit2}_6_0` as TileId,
        // Pung (suit1)
        `${suit1}_2_0` as TileId, `${suit1}_2_1` as TileId, `${suit1}_2_2` as TileId,
        // Chow (suit2) 7-8-9
        `${suit2}_7_0` as TileId, `${suit2}_8_0` as TileId, `${suit2}_9_0` as TileId,
        // Pair waiting for completion (suit1)
        `${suit1}_9_0` as TileId, `${suit1}_9_1` as TileId,
        // Winning tile: the self-drawn tile
        `${suit1}_9_2` as TileId,
      ];
      winningTile = `${suit1}_9_2` as TileId;
      goldCount = 2;
    } else if (winType === 'threeGolds') {
      // Three Golds: drew the third gold tile - instant win!
      // Hand with exactly 3 golds (all highlighted)
      fakeHand = [
        // Pung (suit1)
        `${suit1}_2_0` as TileId, `${suit1}_2_1` as TileId, `${suit1}_2_2` as TileId,
        // Chow (suit2) 1-2-3
        `${suit2}_1_0` as TileId, `${suit2}_2_0` as TileId, `${suit2}_3_0` as TileId,
        // Pung (suit1)
        `${suit1}_4_0` as TileId, `${suit1}_4_1` as TileId, `${suit1}_4_2` as TileId,
        // Chow (suit2) 5-6-7
        `${suit2}_5_0` as TileId, `${suit2}_6_0` as TileId, `${suit2}_7_0` as TileId,
        // Pair (suit1)
        `${suit1}_8_0` as TileId, `${suit1}_8_1` as TileId,
        // 3 gold tiles (all special!)
        `${goldSuit}_${goldNum}_0` as TileId,
        `${goldSuit}_${goldNum}_1` as TileId,
        `${goldSuit}_${goldNum}_2` as TileId,
      ];
      winningTile = `${goldSuit}_${goldNum}_2` as TileId; // Last gold drawn
      goldCount = 3;
    } else {
      // Robbing the Gold: stole someone's gold tile when they tried to upgrade
      // Hand with 1 gold (the robbed one), that gold is highlighted
      fakeHand = [
        // Pung (suit1)
        `${suit1}_2_0` as TileId, `${suit1}_2_1` as TileId, `${suit1}_2_2` as TileId,
        // Chow (suit2) 3-4-5
        `${suit2}_3_0` as TileId, `${suit2}_4_0` as TileId, `${suit2}_5_0` as TileId,
        // Pung (suit1)
        `${suit1}_6_0` as TileId, `${suit1}_6_1` as TileId, `${suit1}_6_2` as TileId,
        // Chow (suit2) 7-8-9
        `${suit2}_7_0` as TileId, `${suit2}_8_0` as TileId, `${suit2}_9_0` as TileId,
        // Pung (suit1)
        `${suit1}_1_0` as TileId, `${suit1}_1_1` as TileId, `${suit1}_1_2` as TileId,
        // Pair (suit2)
        `${suit2}_1_0` as TileId, `${suit2}_1_1` as TileId,
        // The robbed gold tile (completes hand as wildcard)
        `${goldSuit}_${goldNum}_0` as TileId,
      ];
      winningTile = `${goldSuit}_${goldNum}_0` as TileId;
      goldCount = 1;
    }

    const multiplier = winType === 'selfDraw' || winType === 'threeGolds' ? 2 : 1;
    const subtotal = 2 + 3 + goldCount; // base + bonus tiles + golds
    const threeGoldsBonus = winType === 'threeGolds' ? 30 : 0;
    const robbingGoldBonus = winType === 'robbingGold' ? 30 : 0;
    const total = subtotal * multiplier + threeGoldsBonus + robbingGoldBonus;

    const fakeScore: ScoreBreakdown & Record<string, unknown> = {
      base: 2,
      bonusTiles: 3,
      golds: goldCount,
      concealedKongBonus: 0,
      exposedKongBonus: 0,
      dealerStreakBonus: 0,
      subtotal,
      multiplier,
      total,
    };
    // Only add optional bonus fields if they have values (Firebase rejects undefined)
    if (winType === 'threeGolds') {
      fakeScore.threeGoldsBonus = 30;
    }
    if (winType === 'robbingGold') {
      fakeScore.robbingGoldBonus = 30;
    }

    const fakeWinner: WinnerInfo & Record<string, unknown> = {
      seat: mySeat,
      isSelfDraw: winType === 'selfDraw' || winType === 'threeGolds',
      isThreeGolds: winType === 'threeGolds',
      isRobbingGold: winType === 'robbingGold',
      hand: fakeHand,
      winningTile: winningTile,
      score: fakeScore,
    };
    // Only add discarder for non-self-draw wins
    if (winType === 'normal' || winType === 'robbingGold') {
      fakeWinner.discarderSeat = ((mySeat + 1) % 4) as SeatIndex;
    }

    try {
      await update(ref(db, `rooms/${roomCode}/game`), {
        phase: 'ended',
        winner: fakeWinner,
      });
    } catch (err) {
      console.error('Failed to trigger test win:', err);
    }
  };

  // Play sound and show indicator when it becomes my turn
  const prevTurnRef = useRef<SeatIndex | null>(null);
  const prevCallingPhaseRef = useRef<boolean>(false);
  const [showTurnFlash, setShowTurnFlash] = useState(false);

  useEffect(() => {
    // Playing phase: my turn to draw/discard
    if (
      gameState?.phase === 'playing' &&
      gameState.currentPlayerSeat === mySeat &&
      prevTurnRef.current !== mySeat &&
      prevTurnRef.current !== null // Don't play on initial load
    ) {
      playSound('yourTurn');
      setShowTurnFlash(true);
      setTimeout(() => setShowTurnFlash(false), 1500);
    }
    prevTurnRef.current = gameState?.currentPlayerSeat ?? null;
  }, [gameState?.currentPlayerSeat, gameState?.phase, mySeat, playSound]);

  // Calling phase: alert when I need to respond
  useEffect(() => {
    const justEnteredCalling = isCallingPhase && !prevCallingPhaseRef.current;

    if (justEnteredCalling && myPendingCall === 'waiting') {
      playSound('callAlert');
      setShowTurnFlash(true);
      setTimeout(() => setShowTurnFlash(false), 1500);
    }
    prevCallingPhaseRef.current = isCallingPhase;
  }, [isCallingPhase, myValidCalls, myPendingCall, playSound]);

  // Loading state
  if (authLoading || roomLoading || gameLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">Loading game...</div>
          <div className="text-slate-400">Room: {roomCode}</div>
        </div>
      </div>
    );
  }

  // No game state or room not fully loaded
  if (!room || !room.players || !gameState || mySeat === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4 text-red-400">Game Not Found</div>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Game ended
  if (gameState.phase === 'ended') {
    // Draw game (no winner)
    if (!gameState.winner) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🤝 Draw Game</div>
              <div className="text-xl text-slate-300">Wall exhausted - no winner</div>
              <p className="text-slate-400 mt-1">No payment this round. Dealer stays.</p>
            </div>

            {/* 2-column grid: Session Scores + Game Log */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Session Scores */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-blue-400">
                    Session Scores {sessionScores?.rounds ? `(Round ${sessionScores.rounds.length})` : ''}
                  </h3>
                  {isHost && (
                    <button
                      onClick={() => setShowScoreEdit(true)}
                      className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {sessionScores && sessionScores.rounds ? (() => {
                  const adjustments = sessionScores.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                  // Calculate won scores (raw from rounds + adjustments)
                  const wonScores: Record<string, number> = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                  for (const round of sessionScores.rounds || []) {
                    if (round.winnerSeat !== null && round.score > 0) {
                      wonScores[`seat${round.winnerSeat}`] += round.score;
                    }
                  }
                  // Add adjustments to won scores
                  for (const seat of [0, 1, 2, 3]) {
                    wonScores[`seat${seat}`] += adjustments[`seat${seat}` as keyof typeof adjustments] || 0;
                  }
                  // Calculate net using formula: net = won × 4 - totalWon
                  const totalWon = Object.values(wonScores).reduce((sum, v) => sum + v, 0);
                  const netScores: Record<string, number> = {};
                  for (const seat of [0, 1, 2, 3]) {
                    netScores[`seat${seat}`] = wonScores[`seat${seat}`] * 4 - totalWon;
                  }
                  return (
                    <div className="text-base">
                      <div className="flex justify-between text-slate-400 text-sm mb-2 border-b border-slate-600 pb-1">
                        <span>Player</span>
                        <div className="flex gap-6">
                          <span className="w-12 text-right">Won</span>
                          <span className="w-12 text-right">Net</span>
                        </div>
                      </div>
                      {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
                        const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                        const playerName = player?.name || `Player ${seat + 1}`;
                        const isBot = player?.isBot;
                        const won = wonScores[`seat${seat}`];
                        const net = netScores[`seat${seat}`];
                        return (
                          <div
                            key={seat}
                            className="flex justify-between py-1 text-slate-200"
                          >
                            <span className="truncate">{isBot ? '🤖 ' : ''}{playerName}</span>
                            <div className="flex gap-6">
                              <span className="w-12 text-right">{won}</span>
                              <span className={`w-12 text-right ${net < 0 ? 'text-red-400' : net > 0 ? 'text-green-400' : ''}`}>
                                {net > 0 ? '+' : ''}{net}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : <p className="text-slate-400">No session data</p>}
              </div>

              {/* Game Log / Session Summary Tabs */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                {/* Tab buttons */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setLogTab('log')}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      logTab === 'log'
                        ? 'bg-slate-600 text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Game Log
                  </button>
                  <button
                    onClick={() => setLogTab('summary')}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      logTab === 'summary'
                        ? 'bg-slate-600 text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Session Summary
                  </button>
                </div>

                {logTab === 'log' ? (
                  <>
                    {/* Pagination header */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={goToPrevRound}
                        disabled={!canGoPrev}
                        className={`px-2 py-1 text-sm rounded ${
                          canGoPrev
                            ? 'text-slate-300 hover:bg-slate-600'
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        ◀
                      </button>
                      <span className="text-sm text-slate-400">
                        {viewingRound === null ? 'Current Game' : `Game ${viewingRound} of ${totalRounds}`}
                      </span>
                      <button
                        onClick={goToNextRound}
                        disabled={!canGoNext}
                        className={`px-2 py-1 text-sm rounded ${
                          canGoNext
                            ? 'text-slate-300 hover:bg-slate-600'
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        ▶
                      </button>
                    </div>
                    {/* Log entries */}
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {displayedLog.length > 0 ? (
                        displayedLog.map((entry, index) => (
                          <div key={index} className="text-xs py-0.5 text-slate-400">
                            {transformLogEntry(entry, room, mySeat)}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500 italic">No log entries</div>
                      )}
                    </div>
                  </>
                ) : (
                  /* Session Summary */
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {sessionScores?.rounds && sessionScores.rounds.length > 0 ? (
                      <>
                        {sessionScores.rounds.map((round) => {
                          const winnerPlayer = round.winnerSeat !== null
                            ? room?.players?.[`seat${round.winnerSeat}` as keyof typeof room.players]
                            : null;
                          const winnerName = winnerPlayer?.name || round.winnerName;

                          // Determine win type from archived log
                          const roundLog = gameLogs[round.roundNumber] || [];
                          const winEntry = roundLog.find(e => e.includes('wins'));
                          let winType = '';
                          if (round.winnerSeat === null) {
                            winType = '';
                          } else if (winEntry?.includes('Three Golds')) {
                            winType = '(Three Golds!)';
                          } else if (winEntry?.includes('Robbing')) {
                            winType = '(Robbing Gold!)';
                          } else if (winEntry?.includes('self-draw')) {
                            winType = '(self-draw)';
                          } else if (winEntry) {
                            // Extract discarder name from "wins on X's discard"
                            const match = winEntry.match(/on (\w+)'s discard/);
                            winType = match ? `(on ${match[1]})` : '';
                          }

                          // Find adjustments made after this round
                          const adjustmentEntries = roundLog.filter(e => e.includes('Host adjusted:'));

                          return (
                            <div key={round.roundNumber}>
                              <div className="text-xs text-slate-400">
                                {round.winnerSeat !== null ? (
                                  <span>
                                    {round.roundNumber}. {winnerName}{' '}
                                    <span className="text-emerald-400">+{round.score}</span>{' '}
                                    <span className="text-slate-500">{winType}</span>
                                  </span>
                                ) : (
                                  <span>{round.roundNumber}. Draw</span>
                                )}
                              </div>
                              {/* Show per-round adjustments */}
                              {adjustmentEntries.map((entry, idx) => (
                                <div key={idx} className="text-xs text-orange-400 pl-4">
                                  {entry.replace('Host adjusted: ', '↳ Adj: ')}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No completed rounds yet</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3">
              {/* Ready status */}
              <p className="text-base text-slate-400">
                {allReady ? (
                  <span className="text-emerald-400">All players ready!</span>
                ) : (
                  <span>{readyCount}/{totalPlayers} players ready</span>
                )}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                {sessionScores && (
                  <button
                    onClick={() => setShowSettleModal(true)}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg text-lg"
                  >
                    Settle
                  </button>
                )}
                {/* Ready toggle button */}
                <button
                  onClick={handleToggleReady}
                  className={`px-8 py-3 font-semibold rounded-lg text-lg ${
                    myReadyState
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black animate-pulse shadow-lg shadow-amber-500/50'
                  }`}
                >
                  {myReadyState ? '✓ Ready' : 'Ready Up!'}
                </button>
                {/* Host start button - only enabled when all ready */}
                {isHost && (
                  <button
                    onClick={async () => {
                      // On draw, dealer stays
                      await startGame(gameState.dealerSeat);
                    }}
                    disabled={!allReady}
                    className={`px-8 py-3 font-semibold rounded-lg text-lg ${
                      allReady
                        ? 'bg-amber-500 hover:bg-amber-400 text-black'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Another Round (Dealer Stays)
                  </button>
                )}
              </div>
            </div>

            {/* Settlement Modal */}
            {showSettleModal && sessionScores && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-slate-600">
                  <h3 className="text-xl font-bold mb-4 text-center">Settlement Summary</h3>
                  <p className="text-slate-300 text-lg mb-4 text-center">
                    To balance all scores:
                  </p>
                  {(() => {
                    const playerNames: Record<string, string> = {};
                    ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
                      const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                      playerNames[`seat${seat}`] = player?.name || `Player ${seat + 1}`;
                    });
                    const { settlements } = calculateSettlement(
                      sessionScores.rounds || [],
                      playerNames
                    );

                    if (settlements.length === 0) {
                      return (
                        <p className="text-center text-slate-400">All players are even!</p>
                      );
                    }

                    return (
                      <ul className="space-y-2">
                        {settlements.map((s, i) => (
                          <li key={i} className="text-center text-lg">
                            <span className="text-red-400">{s.from}</span>
                            {' → '}
                            <span className="text-green-400">{s.to}</span>
                            {': '}
                            <span className="font-bold text-amber-400">{s.amount}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  <div className="mt-6">
                    <button
                      onClick={() => setShowSettleModal(false)}
                      className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Score Edit Modal (Host Only) */}
            <ScoreEditModal
              isOpen={showScoreEdit}
              onClose={() => setShowScoreEdit(false)}
              players={([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
                const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                // Compute cumulative "Won" from rounds + adjustments
                let won = 0;
                for (const round of sessionScores?.rounds || []) {
                  if (round.winnerSeat === seat && round.score > 0) {
                    won += round.score;
                  }
                }
                const existingAdjustments = sessionScores?.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                won += existingAdjustments[`seat${seat}` as keyof typeof existingAdjustments] || 0;
                return {
                  seatIndex: seat,
                  name: player?.name || `Player ${seat + 1}`,
                  currentWon: won,
                };
              })}
              onSave={async (adjustments) => {
                await adjustCumulativeScores(roomCode, adjustments);
              }}
            />
          </div>
        </div>
      );
    }

    // Winner exists
    const winner = gameState.winner;
    const winnerName =
      room.players[`seat${winner.seat}` as keyof typeof room.players]?.name || 'Unknown';
    const discarderName = winner.discarderSeat !== undefined
      ? room.players[`seat${winner.discarderSeat}` as keyof typeof room.players]?.name || 'Unknown'
      : null;

    // Suspense overlay before revealing winner
    if (showWinnerSuspense) {
      const sortedWinningHand = winner.hand ? sortTilesForDisplay(winner.hand, gameState.goldTileType) : [];
      const winnerExposedMelds = gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds] || [];

      // Determine which tiles are "special" (winning tiles that fly in)
      const getIsSpecialTile = (tileId: string) => {
        if (winner.isThreeGolds) {
          return gameState.goldTileType && isGoldTile(tileId, gameState.goldTileType);
        }
        return tileId === winner.winningTile;
      };

      // Count gold tiles for stagger
      const goldTileIndices: number[] = [];
      if (winner.isThreeGolds) {
        sortedWinningHand.forEach((tid, idx) => {
          if (gameState.goldTileType && isGoldTile(tid, gameState.goldTileType)) {
            goldTileIndices.push(idx);
          }
        });
      }

      return (
        <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white flex flex-col items-center justify-center relative overflow-hidden transition-opacity duration-500 ${suspensePhase === 'fading' ? 'opacity-0' : 'opacity-100'}`}>
          {/* Pulsing background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse" />
          </div>

          {/* CSS for animations */}
          <style jsx>{`
            @keyframes revealTile {
              0% {
                transform: scale(1.1);
                opacity: 0;
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
            @keyframes flyInFromTop {
              0% {
                transform: translateY(-200px) rotate(-10deg);
                opacity: 0;
              }
              70% {
                transform: translateY(10px) rotate(2deg);
                opacity: 1;
              }
              100% {
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
            }
            @keyframes winningGlow {
              0%, 100% {
                box-shadow: 0 0 10px #fbbf24, 0 0 20px #fbbf24, 0 0 30px #f59e0b;
              }
              50% {
                box-shadow: 0 0 20px #fbbf24, 0 0 40px #fbbf24, 0 0 60px #f59e0b;
              }
            }
          `}</style>

          {/* Suspense content - no name revealed */}
          <div className="text-center z-10 mb-8">
            <div className="text-5xl mb-4">🀄</div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-400 animate-pulse">
              The winner is...
            </div>
          </div>

          {/* Hand Tiles - Face down then reveal */}
          <div className="z-10 flex flex-wrap justify-center gap-1 px-4 max-w-4xl mb-4">
            {sortedWinningHand.map((tileId, index) => {
              const tileType = getTileType(tileId);
              const isGold = gameState.goldTileType && isGoldTile(tileId, gameState.goldTileType);
              const isSpecial = getIsSpecialTile(tileId);
              const goldIndex = goldTileIndices.indexOf(index);
              const goldStaggerDelay = goldIndex >= 0 ? goldIndex * 0.15 : 0;

              // Calculate when this tile should reveal (staggered)
              const revealDelay = index * 0.05;
              const shouldBeRevealed = suspensePhase === 'flipping' || suspensePhase === 'flyIn' || suspensePhase === 'fading';

              // Get suit-specific text color (matching gameplay)
              const getSuitColor = (tt: string) => {
                if (tt.startsWith('dots_')) return 'text-red-600';
                if (tt.startsWith('bamboo_')) return 'text-blue-600';
                if (tt.startsWith('characters_')) return 'text-green-600';
                return 'text-slate-800';
              };

              // Special tiles: show green placeholder until fly-in
              if (isSpecial) {
                if (suspensePhase === 'flyIn' || suspensePhase === 'fading') {
                  // Fly in the special tile
                  return (
                    <div
                      key={`${tileId}-${index}`}
                      className={`
                        w-10 h-14 sm:w-12 sm:h-16 rounded-md border-2 flex items-center justify-center text-lg sm:text-xl font-bold
                        ${isGold ? `bg-yellow-100 border-yellow-400 ${getSuitColor(tileType)}` : `bg-white border-gray-300 ${getSuitColor(tileType)}`}
                        ring-2 ring-amber-400 shadow-lg
                      `}
                      style={{
                        animation: `flyInFromTop 0.6s ease-out ${goldStaggerDelay}s both, winningGlow 1s ease-in-out ${0.6 + goldStaggerDelay}s infinite`,
                      }}
                    >
                      {getTileDisplayText(tileType)}
                    </div>
                  );
                }
                // Before fly-in: show green placeholder (hidden during flipping phase)
                return (
                  <div
                    key={`${tileId}-${index}`}
                    className="w-10 h-14 sm:w-12 sm:h-16 rounded-md bg-emerald-700 border-2 border-emerald-600"
                    style={{
                      opacity: shouldBeRevealed ? 0 : 1,
                      transition: `opacity 0.3s ease-out ${revealDelay}s`
                    }}
                  />
                );
              }

              // Regular tiles: green -> white reveal
              return (
                <div
                  key={`${tileId}-${index}`}
                  className="w-10 h-14 sm:w-12 sm:h-16 rounded-md relative"
                >
                  {/* Green back (fades out) */}
                  <div
                    className="absolute inset-0 rounded-md bg-emerald-700 border-2 border-emerald-600"
                    style={{
                      opacity: shouldBeRevealed ? 0 : 1,
                      transition: `opacity 0.2s ease-out ${revealDelay}s`,
                    }}
                  />
                  {/* Tile face (fades in) */}
                  <div
                    className={`
                      absolute inset-0 rounded-md border-2 flex items-center justify-center text-lg sm:text-xl font-bold
                      ${isGold ? `bg-yellow-100 border-yellow-400 ${getSuitColor(tileType)}` : `bg-white border-gray-300 ${getSuitColor(tileType)}`}
                    `}
                    style={{
                      opacity: shouldBeRevealed ? 1 : 0,
                      transform: shouldBeRevealed ? 'scale(1)' : 'scale(0.9)',
                      transition: `opacity 0.2s ease-out ${revealDelay}s, transform 0.2s ease-out ${revealDelay}s`,
                    }}
                  >
                    {getTileDisplayText(tileType)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Exposed Melds - Always visible */}
          {winnerExposedMelds.length > 0 && (
            <div className="z-10 flex flex-wrap justify-center gap-2 px-4">
              <span className="text-slate-400 text-sm mr-2 self-center">Melds:</span>
              {winnerExposedMelds.map((meld, meldIdx) => {
                // Helper for meld tile colors
                const getMeldTileColor = (tt: string) => {
                  if (tt.startsWith('dots_')) return 'text-red-600';
                  if (tt.startsWith('bamboo_')) return 'text-blue-600';
                  if (tt.startsWith('characters_')) return 'text-green-600';
                  return 'text-slate-800';
                };
                return (
                  <div key={meldIdx} className="flex gap-0.5 bg-slate-800/50 rounded p-1">
                    {meld.tiles.map((tile, i) => {
                      const meldTileType = getTileType(tile);
                      return (
                        <div
                          key={i}
                          className={`
                            w-8 h-11 sm:w-10 sm:h-14 rounded border-2 flex items-center justify-center text-sm sm:text-base font-bold
                            ${gameState.goldTileType && isGoldTile(tile, gameState.goldTileType)
                              ? `bg-yellow-100 border-yellow-400 ${getMeldTileColor(meldTileType)}`
                              : `bg-white border-gray-300 ${getMeldTileColor(meldTileType)}`
                            }
                          `}
                        >
                          {meld.isConcealed ? '' : getTileDisplayText(meldTileType)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading dots */}
          <div className="mt-8 flex justify-center gap-2 z-10">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-4 relative overflow-hidden">
        {/* Animated background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-yellow-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-orange-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Fireworks for winner / Sad faces for losers */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {winner.seat === mySeat ? (
            // Fireworks for winners - shooting up from bottom and exploding
            <>
              {/* Firework rockets that shoot up and explode */}
              {Array.from({ length: 10 }).map((_, rocketIndex) => {
                const launchPositions = [10, 25, 40, 55, 70, 85, 18, 48, 62, 78];
                const explodeHeights = [15, 25, 20, 30, 22, 28, 35, 18, 32, 24];
                const delays = [0, 0.5, 1.0, 0.3, 0.8, 1.3, 0.2, 0.7, 1.1, 0.4];
                const colors = [
                  ['#ff0', '#f80', '#f00', '#ff4'],
                  ['#0ff', '#08f', '#00f', '#4ff'],
                  ['#f0f', '#f08', '#80f', '#f4f'],
                  ['#0f0', '#8f0', '#0f8', '#4f4'],
                  ['#ff0', '#fff', '#ff8', '#ffa'],
                  ['#f08', '#f0f', '#f4f', '#f8f'],
                  ['#0ff', '#0f8', '#0f0', '#8ff'],
                  ['#ff0', '#f80', '#fa0', '#fc0'],
                  ['#f0f', '#80f', '#a0f', '#c0f'],
                  ['#0f0', '#0f8', '#0fa', '#0fc'],
                ];

                return (
                  <div key={`rocket-${rocketIndex}`}>
                    {/* Rocket trail shooting up */}
                    <div
                      className="absolute w-1 rounded-full"
                      style={{
                        left: `${launchPositions[rocketIndex]}%`,
                        bottom: '0',
                        height: '80px',
                        background: `linear-gradient(to top, ${colors[rocketIndex][0]}, transparent)`,
                        animation: `rocket-launch 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                        ['--explode-height' as string]: `${explodeHeights[rocketIndex]}%`,
                      }}
                    />
                    {/* Explosion burst */}
                    <div
                      className="absolute"
                      style={{
                        left: `${launchPositions[rocketIndex]}%`,
                        top: `${explodeHeights[rocketIndex]}%`,
                        animation: `explosion-appear 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                      }}
                    >
                      {/* Explosion particles - spreading wide */}
                      {Array.from({ length: 20 }).map((_, particleIndex) => {
                        const angle = (particleIndex * 18) * (Math.PI / 180);
                        const distance = 100 + (particleIndex % 4) * 40;
                        const colorSet = colors[rocketIndex];
                        const color = colorSet[particleIndex % 4];
                        const size = 4 + (particleIndex % 3) * 2;
                        return (
                          <div
                            key={`particle-${particleIndex}`}
                            className="absolute rounded-full"
                            style={{
                              width: `${size}px`,
                              height: `${size}px`,
                              marginLeft: `-${size/2}px`,
                              marginTop: `-${size/2}px`,
                              backgroundColor: color,
                              boxShadow: `0 0 ${size*2}px ${color}, 0 0 ${size*4}px ${color}`,
                              animation: `firework-explode 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                              ['--tx' as string]: `${Math.cos(angle) * distance}px`,
                              ['--ty' as string]: `${Math.sin(angle) * distance + 30}px`,
                            }}
                          />
                        );
                      })}
                      {/* Center flash */}
                      <div
                        className="absolute w-16 h-16 -ml-8 -mt-8 rounded-full"
                        style={{
                          backgroundColor: '#fff',
                          boxShadow: `0 0 40px #fff, 0 0 80px ${colors[rocketIndex][0]}, 0 0 120px ${colors[rocketIndex][1]}`,
                          animation: `firework-flash 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* Sparkle overlay */}
              {Array.from({ length: 40 }).map((_, i) => {
                const sparkles = ['✨', '⭐', '🌟', '💫', '🎇', '🎆'];
                const sparkle = sparkles[i % sparkles.length];
                const left = ((i * 29) % 100);
                const top = ((i * 41) % 70) + 5;
                const delay = (i * 0.15) % 2.5;
                const size = 1.5 + (i % 3) * 0.6;
                return (
                  <div
                    key={`sparkle-${i}`}
                    className="absolute"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      fontSize: `${size}rem`,
                      animation: `sparkle-twinkle 1.2s ease-in-out ${delay}s infinite`,
                    }}
                  >
                    {sparkle}
                  </div>
                );
              })}
            </>
          ) : (
            // Sad faces for losers - falling slowly
            <>
              {Array.from({ length: 15 }).map((_, i) => {
                const sadEmojis = ['😢', '😭', '😿', '💔', '😞', '😔'];
                const emoji = sadEmojis[i % sadEmojis.length];
                // Use stable pseudo-random values based on index
                const left = ((i * 47) % 100);
                const delay = (i * 0.4) % 4;
                const duration = 5 + (i % 5);
                const size = 3 + (i % 3) * 1.5;
                return (
                  <div
                    key={i}
                    className="absolute text-2xl opacity-50"
                    style={{
                      left: `${left}%`,
                      top: '-50px',
                      fontSize: `${size}rem`,
                      animation: `sad-fall ${duration}s linear ${delay}s infinite`,
                    }}
                  >
                    {emoji}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* CSS for animations */}
        <style jsx>{`
          @keyframes rocket-launch {
            0% {
              transform: translateY(0);
              opacity: 1;
            }
            30% {
              transform: translateY(calc(-100vh + var(--explode-height)));
              opacity: 1;
            }
            35% {
              opacity: 0;
            }
            100% {
              opacity: 0;
            }
          }
          @keyframes explosion-appear {
            0%, 25% {
              transform: scale(0);
              opacity: 0;
            }
            30% {
              transform: scale(1);
              opacity: 1;
            }
            100% {
              transform: scale(1);
              opacity: 0;
            }
          }
          @keyframes firework-explode {
            0%, 25% {
              transform: translate(0, 0) scale(0);
              opacity: 0;
            }
            35% {
              transform: translate(0, 0) scale(1);
              opacity: 1;
            }
            100% {
              transform: translate(var(--tx), var(--ty)) scale(0.3);
              opacity: 0;
            }
          }
          @keyframes firework-flash {
            0%, 25% {
              transform: scale(0);
              opacity: 0;
            }
            30% {
              transform: scale(1.5);
              opacity: 1;
            }
            50% {
              transform: scale(0.3);
              opacity: 0;
            }
            100% {
              transform: scale(0);
              opacity: 0;
            }
          }
          @keyframes sparkle-twinkle {
            0%, 100% {
              transform: scale(0.5);
              opacity: 0.2;
            }
            50% {
              transform: scale(1.3);
              opacity: 1;
            }
          }
          @keyframes sad-fall {
            0% {
              transform: translateY(0) rotate(0deg);
              opacity: 0.5;
            }
            100% {
              transform: translateY(110vh) rotate(30deg);
              opacity: 0.1;
            }
          }
        `}</style>

        <div className="max-w-7xl mx-auto relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="text-center mb-3 lg:mb-4">
            {/* Animated title row */}
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className={`text-4xl sm:text-5xl ${winner.seat === mySeat ? 'animate-bounce' : ''}`} style={{ animationDuration: '1s', animationIterationCount: '3' }}>
                {winner.seat === mySeat
                  ? (winner.isThreeGolds ? '🀄🀄🀄' : winner.isRobbingGold ? '💰💰💰' : '🏆')
                  : '😔'}
              </div>
              <div className={`text-2xl sm:text-4xl font-bold ${
                winner.seat !== mySeat
                  ? 'text-slate-400'
                  : winner.isThreeGolds
                    ? 'text-yellow-300 animate-pulse'
                    : winner.isRobbingGold
                      ? 'text-amber-300 animate-pulse'
                      : 'text-amber-400'
              }`}>
                {winner.seat !== mySeat
                  ? 'So Close...'
                  : winner.isThreeGolds ? 'THREE GOLDS!' : winner.isRobbingGold ? 'ROBBING THE GOLD!' : 'WINNER!'}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">{winnerName}</div>
            <div className="text-base text-slate-300">
              {winner.isThreeGolds
                ? 'Instant win with 3 Gold tiles!'
                : winner.isRobbingGold
                  ? 'Claimed the revealed Gold tile!'
                  : winner.isSelfDraw
                    ? 'Won by self-draw'
                    : `Won on ${discarderName}'s discard`}
              {winner.seat === gameState.dealerSeat && (
                <span className="text-orange-400 ml-2">
                  {sessionScores?.dealerStreak && sessionScores.dealerStreak > 1
                    ? `🔥 ${sessionScores.dealerStreak}-round streak!`
                    : ' 🔥 Dealer wins!'}
                </span>
              )}
            </div>
            {/* Score badge */}
            <div className="mt-2 inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xl sm:text-2xl font-bold px-5 py-1.5 rounded-full shadow-lg">
              +{winner.score.total} points
            </div>
          </div>

          {/* Main content - 2 column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 mb-3 flex-1">
            {/* Left column - Hands */}
            <div className="flex flex-col gap-3">
              {/* Winning Hand */}
              {winner.hand && (
                <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1 flex flex-col">
                  <h3 className="text-base lg:text-lg font-semibold text-amber-400 mb-2">Winning Hand</h3>
                  <div className="flex flex-wrap gap-1 lg:gap-1.5 mb-2">
                    {(() => {
                      const sortedHand = sortTilesForDisplay(winner.hand, gameState.goldTileType);
                      return sortedHand.map((tileId: string, index: number) => {
                        // For Three Golds: highlight all gold tiles
                        // For other wins: highlight only the winning tile
                        const isGold = gameState.goldTileType && isGoldTile(tileId, gameState.goldTileType);
                        const isHighlighted = winner.isThreeGolds
                          ? isGold
                          : tileId === winner.winningTile;
                        return (
                          <div key={`hand-${index}`} className={`relative ${isHighlighted ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-700 rounded-md' : ''}`}>
                            <Tile
                              tileId={tileId}
                              goldTileType={gameState.goldTileType}
                              size="md"
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds]?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 lg:gap-1.5">
                      <span className="text-slate-400 text-xs lg:text-sm">Called:</span>
                      {gameState.exposedMelds[`seat${winner.seat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                        <div key={`meld-${meldIndex}`} className={`flex gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
                          {meld.tiles.map((tileId: string, tileIndex: number) => (
                            <Tile
                              key={`meld-${meldIndex}-${tileIndex}`}
                              tileId={tileId}
                              goldTileType={gameState.goldTileType}
                              size="md"
                            />
                          ))}
                          {meld.isConcealed && <span className="text-pink-300 text-xs ml-1 self-center">C</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Your Hand (if not winner) */}
              {mySeat !== null && mySeat !== winner.seat && myHand.length > 0 && (
                <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1 flex flex-col">
                  <h3 className="text-base lg:text-lg font-semibold text-blue-400 mb-2">Your Hand</h3>
                  <div className="flex flex-wrap gap-1 lg:gap-1.5 mb-2">
                    {sortTilesForDisplay(myHand, gameState.goldTileType).map((tileId: string, index: number) => (
                      <Tile
                        key={`my-hand-${index}`}
                        tileId={tileId}
                        goldTileType={gameState.goldTileType}
                        size="md"
                      />
                    ))}
                  </div>
                  {gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds]?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 lg:gap-1.5">
                      <span className="text-slate-400 text-xs lg:text-sm">Called:</span>
                      {gameState.exposedMelds[`seat${mySeat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                        <div key={`my-meld-${meldIndex}`} className={`flex gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
                          {meld.tiles.map((tileId: string, tileIndex: number) => (
                            <Tile
                              key={`my-meld-${meldIndex}-${tileIndex}`}
                              tileId={tileId}
                              goldTileType={gameState.goldTileType}
                              size="md"
                            />
                          ))}
                          {meld.isConcealed && <span className="text-pink-300 text-xs ml-1 self-center">C</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column - Scores */}
            <div className="flex flex-col gap-3">
              {/* Score Breakdown */}
              <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1">
                <h3 className="text-base lg:text-lg font-semibold text-amber-400 mb-2">Score Breakdown</h3>
                <div className="text-sm lg:text-base space-y-0.5 lg:space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Base:</span>
                    <span>{winner.score.base}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Bonus tiles:</span>
                    <span>+{winner.score.bonusTiles}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Gold tiles:</span>
                    <span>+{winner.score.golds}</span>
                  </div>
                  {winner.score.concealedKongBonus > 0 && (
                    <div className="flex justify-between text-pink-400">
                      <span>Concealed Gang:</span>
                      <span>+{winner.score.concealedKongBonus}</span>
                    </div>
                  )}
                  {winner.score.exposedKongBonus > 0 && (
                    <div className="flex justify-between text-pink-300">
                      <span>Exposed Gang:</span>
                      <span>+{winner.score.exposedKongBonus}</span>
                    </div>
                  )}
                  {winner.score.dealerStreakBonus > 0 && (
                    <div className="flex justify-between text-orange-400">
                      <span>Dealer streak:</span>
                      <span>+{winner.score.dealerStreakBonus}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-600 pt-1">
                    <span className="text-slate-300">Subtotal:</span>
                    <span>{winner.score.subtotal}</span>
                  </div>
                  {winner.isSelfDraw && (
                    <div className="flex justify-between">
                      <span className="text-slate-300">Self-draw:</span>
                      <span>×{winner.score.multiplier}</span>
                    </div>
                  )}
                  {winner.isThreeGolds && (
                    <div className="flex justify-between text-yellow-400">
                      <span>Three Golds bonus:</span>
                      <span>+{winner.score.threeGoldsBonus}</span>
                    </div>
                  )}
                  {winner.isRobbingGold && winner.score.robbingGoldBonus && (
                    <div className="flex justify-between text-amber-400">
                      <span>Robbing Gold bonus:</span>
                      <span>+{winner.score.robbingGoldBonus}</span>
                    </div>
                  )}
                  {winner.score.goldenPairBonus && winner.score.goldenPairBonus > 0 && (
                    <div className="flex justify-between text-yellow-400">
                      <span>Golden Pair bonus:</span>
                      <span>+{winner.score.goldenPairBonus}</span>
                    </div>
                  )}
                  {winner.score.noBonusBonus && winner.score.noBonusBonus > 0 && (
                    <div className="flex justify-between text-cyan-400">
                      <span>No Bonus bonus:</span>
                      <span>+{winner.score.noBonusBonus}</span>
                    </div>
                  )}
                  {winner.score.allOneSuitBonus && winner.score.allOneSuitBonus > 0 && (
                    <div className="flex justify-between text-pink-400">
                      <span>All One Suit bonus:</span>
                      <span>+{winner.score.allOneSuitBonus}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-600 pt-1 font-bold text-base text-amber-400">
                    <span>Total:</span>
                    <span>{winner.score.total}</span>
                  </div>
                </div>
              </div>

              {/* Cumulative Scores */}
              {sessionScores && sessionScores.rounds && (
                <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base lg:text-lg font-semibold text-blue-400">
                      Session Scores (Round {sessionScores.rounds?.length || 1})
                    </h3>
                    {isHost && (
                      <button
                        onClick={() => setShowScoreEdit(true)}
                        className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {(() => {
                    const adjustments = sessionScores.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                    // Calculate won scores (raw from rounds + adjustments)
                    const wonScores: Record<string, number> = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                    for (const round of sessionScores.rounds || []) {
                      if (round.winnerSeat !== null && round.score > 0) {
                        wonScores[`seat${round.winnerSeat}`] += round.score;
                      }
                    }
                    // Add adjustments to won scores
                    for (const seat of [0, 1, 2, 3]) {
                      wonScores[`seat${seat}`] += adjustments[`seat${seat}` as keyof typeof adjustments] || 0;
                    }
                    // Calculate net using formula: net = won × 4 - totalWon
                    const totalWon = Object.values(wonScores).reduce((sum, v) => sum + v, 0);
                    const netScores: Record<string, number> = {};
                    for (const seat of [0, 1, 2, 3]) {
                      netScores[`seat${seat}`] = wonScores[`seat${seat}`] * 4 - totalWon;
                    }
                    return (
                      <div className="text-sm lg:text-base">
                        <div className="flex justify-between text-slate-400 text-xs lg:text-sm mb-1 border-b border-slate-600 pb-1">
                          <span>Player</span>
                          <div className="flex gap-4 lg:gap-5">
                            <span className="w-10 lg:w-12 text-right">Won</span>
                            <span className="w-10 lg:w-12 text-right">Net</span>
                          </div>
                        </div>
                        {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
                          const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                          const playerName = player?.name || `Player ${seat + 1}`;
                          const isBot = player?.isBot;
                          const won = wonScores[`seat${seat}`];
                          const net = netScores[`seat${seat}`];
                          const isWinnerSeat = winner.seat === seat;
                          return (
                            <div
                              key={seat}
                              className={`flex justify-between py-0.5 lg:py-1 ${isWinnerSeat ? 'text-amber-400 font-semibold' : 'text-slate-200'}`}
                            >
                              <span className="truncate">{isBot ? '🤖 ' : ''}{playerName}</span>
                              <div className="flex gap-4 lg:gap-5">
                                <span className="w-10 lg:w-12 text-right">{won}</span>
                                <span className={`w-10 lg:w-12 text-right ${net < 0 ? 'text-red-400' : net > 0 ? 'text-green-400' : ''}`}>
                                  {net > 0 ? '+' : ''}{net}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Game Log / Session Summary Tabs */}
              <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600">
                {/* Tab buttons */}
                <div className="flex gap-2 mb-2 lg:mb-3">
                  <button
                    onClick={() => setLogTab('log')}
                    className={`px-2 lg:px-3 py-1 text-xs lg:text-sm rounded transition-colors ${
                      logTab === 'log'
                        ? 'bg-slate-600 text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Game Log
                  </button>
                  <button
                    onClick={() => setLogTab('summary')}
                    className={`px-2 lg:px-3 py-1 text-xs lg:text-sm rounded transition-colors ${
                      logTab === 'summary'
                        ? 'bg-slate-600 text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Session Summary
                  </button>
                </div>

                {logTab === 'log' ? (
                  <>
                    {/* Pagination header */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={goToPrevRound}
                        disabled={!canGoPrev}
                        className={`px-2 py-1 text-xs lg:text-sm rounded ${
                          canGoPrev
                            ? 'text-slate-300 hover:bg-slate-600'
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        ◀
                      </button>
                      <span className="text-xs lg:text-sm text-slate-400">
                        {viewingRound === null ? 'Current Game' : `Game ${viewingRound} of ${totalRounds}`}
                      </span>
                      <button
                        onClick={goToNextRound}
                        disabled={!canGoNext}
                        className={`px-2 py-1 text-xs lg:text-sm rounded ${
                          canGoNext
                            ? 'text-slate-300 hover:bg-slate-600'
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        ▶
                      </button>
                    </div>
                    {/* Log entries */}
                    <div className="max-h-16 lg:max-h-24 overflow-y-auto space-y-0.5 lg:space-y-1">
                      {displayedLog.length > 0 ? (
                        displayedLog.map((entry, index) => (
                          <div key={index} className="text-xs lg:text-sm py-0.5 text-slate-300">
                            {transformLogEntry(entry, room, mySeat)}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs lg:text-sm text-slate-500 italic">No log entries</div>
                      )}
                    </div>
                  </>
                ) : (
                  /* Session Summary */
                  <div className="max-h-16 lg:max-h-24 overflow-y-auto space-y-0.5 lg:space-y-1">
                    {sessionScores?.rounds && sessionScores.rounds.length > 0 ? (
                      <>
                        {sessionScores.rounds.map((round) => {
                          const winnerPlayer = round.winnerSeat !== null
                            ? room?.players?.[`seat${round.winnerSeat}` as keyof typeof room.players]
                            : null;
                          const winnerName = winnerPlayer?.name || round.winnerName;

                          // Determine win type from archived log
                          const roundLog = gameLogs[round.roundNumber] || [];
                          const winEntry = roundLog.find(e => e.includes('wins'));
                          let winType = '';
                          if (round.winnerSeat === null) {
                            winType = '';
                          } else if (winEntry?.includes('Three Golds')) {
                            winType = '(Three Golds!)';
                          } else if (winEntry?.includes('Robbing')) {
                            winType = '(Robbing Gold!)';
                          } else if (winEntry?.includes('self-draw')) {
                            winType = '(self-draw)';
                          } else if (winEntry) {
                            // Extract discarder name from "wins on X's discard"
                            const match = winEntry.match(/on (\w+)'s discard/);
                            winType = match ? `(on ${match[1]})` : '';
                          }

                          // Find adjustments made after this round
                          const adjustmentEntries = roundLog.filter(e => e.includes('Host adjusted:'));

                          return (
                            <div key={round.roundNumber}>
                              <div className="text-xs lg:text-sm text-slate-300">
                                {round.winnerSeat !== null ? (
                                  <span>
                                    {round.roundNumber}. {winnerName}{' '}
                                    <span className="text-emerald-400">+{round.score}</span>{' '}
                                    <span className="text-slate-500">{winType}</span>
                                  </span>
                                ) : (
                                  <span>{round.roundNumber}. Draw</span>
                                )}
                              </div>
                              {/* Show per-round adjustments */}
                              {adjustmentEntries.map((entry, idx) => (
                                <div key={idx} className="text-xs lg:text-sm text-orange-400 pl-4">
                                  {entry.replace('Host adjusted: ', '↳ Adj: ')}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="text-xs lg:text-sm text-slate-500 italic">No completed rounds yet</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons - centered at bottom */}
          <div className="flex flex-col items-center gap-2 lg:gap-3 mt-auto pt-3">
            {/* Ready status */}
            <p className="text-sm lg:text-base text-slate-400">
              {allReady ? (
                <span className="text-emerald-400">All players ready!</span>
              ) : (
                <span>{readyCount}/{totalPlayers} players ready</span>
              )}
            </p>
            <div className="flex gap-2 lg:gap-3 justify-center flex-wrap">
              {sessionScores && (
                <button
                  onClick={() => setShowSettleModal(true)}
                  className="px-6 py-2 lg:px-8 lg:py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg lg:text-lg"
                >
                  Settle
                </button>
              )}
              {/* Ready toggle button */}
              <button
                onClick={handleToggleReady}
                className={`px-6 py-2 lg:px-8 lg:py-2.5 font-semibold rounded-lg lg:text-lg ${
                  myReadyState
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-black animate-pulse shadow-lg shadow-amber-500/50'
                }`}
              >
                {myReadyState ? '✓ Ready' : 'Ready Up!'}
              </button>
              {/* Host start button - only enabled when all ready */}
              {isHost && (
                <button
                  onClick={async () => {
                    // If dealer won, they stay as dealer (dealer streak)
                    // Otherwise, rotate to next player counter-clockwise
                    const dealerWon = winner && winner.seat === gameState.dealerSeat;
                    const nextDealer = dealerWon
                      ? gameState.dealerSeat
                      : ((gameState.dealerSeat + 1) % 4) as SeatIndex;
                    await startGame(nextDealer);
                  }}
                  disabled={!allReady}
                  className={`px-6 py-2 lg:px-8 lg:py-2.5 font-semibold rounded-lg lg:text-lg ${
                    allReady
                      ? 'bg-amber-500 hover:bg-amber-400 text-black'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {winner && winner.seat === gameState.dealerSeat
                    ? 'Another Round (Dealer Stays)'
                    : 'Another Round'}
                </button>
              )}
            </div>
          </div>

          {/* Settlement Modal */}
          {showSettleModal && sessionScores && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-green-900 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-green-700">
                <h3 className="text-xl font-bold mb-4 text-center">Settlement Summary</h3>
                <p className="text-green-300 text-lg mb-4 text-center">
                  To balance all scores:
                </p>
                {(() => {
                  const playerNames: Record<string, string> = {};
                  ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
                    const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                    playerNames[`seat${seat}`] = player?.name || `Player ${seat + 1}`;
                  });
                  const { settlements } = calculateSettlement(
                    sessionScores.rounds || [],
                    playerNames
                  );

                  if (settlements.length === 0) {
                    return (
                      <p className="text-center text-green-200">
                        All players are even - no transfers needed!
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {settlements.map((s, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between bg-green-800/50 p-2 rounded"
                        >
                          <span>
                            {playerNames[`seat${s.from}`]} → {playerNames[`seat${s.to}`]}
                          </span>
                          <span className="font-semibold">{s.amount} pts</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => setShowSettleModal(false)}
                    className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-semibold"
                  >
                    Continue Playing
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-semibold text-lg"
                  >
                    End Session & Leave
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Score Edit Modal (Host Only) */}
          <ScoreEditModal
            isOpen={showScoreEdit}
            onClose={() => setShowScoreEdit(false)}
            players={([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
              const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
              // Compute cumulative "Won" from rounds + adjustments
              let won = 0;
              for (const round of sessionScores?.rounds || []) {
                if (round.winnerSeat === seat && round.score > 0) {
                  won += round.score;
                }
              }
              const existingAdjustments = sessionScores?.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
              won += existingAdjustments[`seat${seat}` as keyof typeof existingAdjustments] || 0;
              return {
                seatIndex: seat,
                name: player?.name || `Player ${seat + 1}`,
                currentWon: won,
              };
            })}
            onSave={async (adjustments) => {
              await adjustCumulativeScores(roomCode, adjustments);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-2 sm:p-3 transition-all duration-300 ${showTurnFlash ? 'ring-4 ring-inset ring-emerald-400/70' : ''}`}>
      {/* Turn notification banner */}
      {showTurnFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-bold animate-bounce">
          Your Turn!
        </div>
      )}

      {/* Toast message */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg text-sm sm:text-base font-medium animate-pulse">
          {toastMessage}
        </div>
      )}

      {/* ========== COMBINED HEADER + PHASE BAR ========== */}
      <GameHeader
        roomCode={roomCode}
        goldTileType={gameState.goldTileType}
        exposedGold={gameState.exposedGold}
        wallCount={gameState.wall?.length ?? 0}
        currentPlayerSeat={gameState.currentPlayerSeat}
        isCallingPhase={isCallingPhase}
        isMyTurn={isMyTurn}
        shouldDraw={shouldDraw}
        chowSelectionMode={chowSelectionMode}
        room={room}
        timerRemainingSeconds={timerRemainingSeconds}
        timerIsWarning={timerIsWarning}
        turnTimerRemainingSeconds={turnTimerRemainingSeconds}
        turnTimerIsWarning={turnTimerIsWarning}
        onSettingsClick={() => setShowSettings(true)}
        onRulesClick={() => setShowRules(true)}
        getPlayerName={getPlayerName}
      />

      {/* ========== YOUR HAND SECTION ========== */}
      <div className="bg-slate-700/60 rounded-xl p-2 sm:p-3 mb-2 sm:mb-3 border border-slate-600">
        {/* Header row: Name + Melds + Bonus */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 text-sm sm:text-lg">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium">{room.players[`seat${mySeat}` as keyof typeof room.players]?.name || 'You'}</span>
            {gameState.dealerSeat === mySeat && <span className="bg-amber-500 text-black text-xs px-1 sm:px-1.5 py-0.5 rounded font-bold">D</span>}
          </div>
          {/* Melds inline */}
          {(gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-slate-500 text-xs sm:text-base">Melds:</span>
              {(gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || []).map((meld, meldIdx) => {
                // Check if this meld should be highlighted for kong selection
                const focusedKongOption = kongSelectionMode ? combinedKongOptions[focusedKongIndex] : null;
                const isMeldHighlighted = focusedKongOption?.type === 'upgrade' && focusedKongOption.meldIndex === meldIdx;

                return (
                  <div
                    key={meldIdx}
                    className={`flex gap-0.5 rounded px-1 transition-all ${
                      meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/50'
                    } ${isMeldHighlighted && !isTouchDevice ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-700' : ''}`}
                  >
                    {meld.tiles.map((tile, i) => <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />)}
                    {meld.isConcealed && <span className="text-pink-300 text-[10px] ml-0.5 self-center">C</span>}
                  </div>
                );
              })}
            </div>
          )}
          {/* Bonus inline */}
          {(gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []).length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500 text-xs sm:text-base">Bonus:</span>
              <span className="text-amber-400 text-xs sm:text-base font-bold">+{(gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []).length}</span>
              {(gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []).map((tile, i) => (
                <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />
              ))}
            </div>
          )}
          <span className="text-slate-500 text-xs sm:text-base ml-auto">{myHand.length} tiles</span>
        </div>

        {/* Hand tiles */}
        {kongSelectionMode ? (
          // Kong selection mode - show tiles with kong highlighting
          (() => {
            const focusedOption = combinedKongOptions[focusedKongIndex];
            const focusedTileType = focusedOption?.tileType;

            return (
              <div className="flex gap-1 flex-wrap justify-center overflow-visible pt-2">
                {myHand.map((tile, index) => {
                  const tileType = getTileType(tile);
                  // For concealed kong: highlight all 4 tiles of that type
                  // For upgrade: highlight just the single tile from hand
                  const isKongTile = focusedOption?.type === 'concealed'
                    ? tileType === focusedTileType
                    : focusedOption?.type === 'upgrade'
                      ? tile === focusedOption.tileFromHand
                      : false;

                  return (
                    <Tile
                      key={`${tile}-${index}`}
                      tileId={tile}
                      goldTileType={gameState.goldTileType}
                      size="lg"
                      isFocused={isKongTile && !isTouchDevice}
                      isChowSelected={isKongTile && isTouchDevice}
                      disabled={!isKongTile}
                    />
                  );
                })}
              </div>
            );
          })()
        ) : chowSelectionMode ? (
          // Chow selection mode - show tiles with chow highlighting
          (() => {
            // Calculate which tile is focused for keyboard navigation
            const validTilesForFocus: TileId[] = selectedChowTiles.length === 0
              ? Array.from(validChowTiles.keys())
              : validChowTiles.get(selectedChowTiles[0]) || [];
            const focusedTile = validTilesForFocus[focusedChowTileIndex];

            return (
              <div className="flex gap-1 flex-wrap justify-center overflow-visible pt-2">
                {myHand.map((tile, index) => {
                  const isValidFirst = validChowTiles.has(tile);
                  const isSelected = selectedChowTiles.includes(tile);
                  const isValidSecond = selectedChowTiles.length === 1 &&
                    (validChowTiles.get(selectedChowTiles[0]) || []).includes(tile);
                  const canClick = isValidFirst || isValidSecond;
                  const isTileFocused = tile === focusedTile;

                  return (
                    <Tile
                      key={`${tile}-${index}`}
                      tileId={tile}
                      goldTileType={gameState.goldTileType}
                      size="lg"
                      onClick={canClick ? () => onChowTileClick(tile) : undefined}
                      isChowValid={selectedChowTiles.length === 0 ? isValidFirst : isValidSecond}
                      isChowSelected={isSelected}
                      isFocused={isTileFocused && !isTouchDevice}
                      disabled={!canClick && !isSelected}
                    />
                  );
                })}
              </div>
            );
          })()
        ) : (
          // Normal mode
          <Hand
            tiles={myHand}
            goldTileType={gameState.goldTileType || undefined}
            onTileClick={isMyTurn && !shouldDraw && gameState.phase === 'playing' ? onTileClick : undefined}
            selectedTile={selectedTile}
            justDrawnTile={
              isMyTurn &&
              !shouldDraw &&
              gameState.lastAction?.playerSeat === mySeat &&
              (gameState.lastAction?.type === 'draw' || gameState.lastAction?.type === 'kong')
                ? (gameState.lastAction.type === 'kong'
                    ? gameState.lastAction.replacementTile
                    : gameState.lastAction.tile)
                : null
            }
          />
        )}

        {/* Action Buttons - inside the hand section (desktop only) */}
        {/* Fixed height container to prevent layout shifts */}
        <div className="mt-2 sm:mt-4 hidden md:flex flex-wrap justify-center items-center gap-2 sm:gap-3 min-h-[52px]">
          {/* Call buttons during calling phase - ordered left-to-right: PASS (lowest) to HU (highest priority) */}
          {isCallingPhase && myPendingCall === 'waiting' && !chowSelectionMode && (
            <>
              <button
                onClick={() => onCallResponse('pass')}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-white hover:bg-gray-100 disabled:bg-gray-500 text-slate-800 disabled:text-white font-bold rounded-lg text-sm sm:text-base"
              >
                PASS <span className="text-xs opacity-60 ml-1">(Space)</span>
              </button>
              {myValidCalls?.canChow && (
                <button
                  onClick={onChowClick}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  CHI <span className="text-xs opacity-60 ml-1">({shortcuts.chow})</span>
                </button>
              )}
              {myValidCalls?.canPung && (
                <button
                  onClick={() => onCallResponse('pung')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  PENG <span className="text-xs opacity-60 ml-1">({shortcuts.pung})</span>
                </button>
              )}
              {myValidCalls?.canKong && (
                <button
                  onClick={() => onCallResponse('kong')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  GANG <span className="text-xs opacity-60 ml-1">({shortcuts.kong})</span>
                </button>
              )}
              {myValidCalls?.canWin && (
                <button
                  onClick={() => onCallResponse('win')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm sm:text-base"
                >
                  HU! <span className="text-xs opacity-60 ml-1">({shortcuts.win})</span>
                </button>
              )}
            </>
          )}

          {/* Chi selection mode buttons - Cancel (left) to Confirm (right) */}
          {isCallingPhase && chowSelectionMode && (
            <>
              <button
                onClick={onCancelChow}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmChow}
                disabled={selectedChowTiles.length !== 2 || processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Confirm Chi ({selectedChowTiles.length}/2)
              </button>
            </>
          )}

          {/* Waiting status - only show after player has actually responded */}
          {isCallingPhase && myPendingCall !== null && myPendingCall !== 'discarder' && myPendingCall !== 'waiting' && (
            <div className="px-3 sm:px-4 py-2 bg-slate-600/50 rounded-lg text-sm sm:text-lg">
              <span className="text-slate-300">You chose </span>
              <span className="text-white font-bold uppercase">{CALL_DISPLAY_NAMES[myPendingCall as CallAction]}</span>
              <span className="text-slate-400 animate-pulse ml-2">waiting...</span>
            </div>
          )}

          {/* Hu buttons */}

          {gameState.phase === 'playing' && isMyTurn && !shouldDraw && canWinNow && (
            <button
              onClick={onDeclareWin}
              disabled={processingAction}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm sm:text-base"
            >
              🎉 HU! <span className="hidden sm:inline text-xs opacity-70">({shortcuts.win})</span>
            </button>
          )}

          {/* Gang button during playing phase (after drawing) - single unified button */}
          {gameState.phase === 'playing' && isMyTurn && !shouldDraw && !kongSelectionMode && combinedKongOptions.length > 0 && (
            <button
              onClick={onKongKeyPress}
              disabled={processingAction}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
            >
              GANG <span className="text-xs opacity-60 ml-1">({shortcuts.kong})</span>
            </button>
          )}

          {/* Gang selection mode buttons */}
          {gameState.phase === 'playing' && isMyTurn && !shouldDraw && kongSelectionMode && (
            <>
              <button
                onClick={onCancelKongSelection}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={() => executeKongOption(combinedKongOptions[focusedKongIndex])}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Confirm Gang ({focusedKongIndex + 1}/{combinedKongOptions.length})
              </button>
            </>
          )}

          {/* Draw/Discard buttons */}
          {gameState.phase === 'playing' && isMyTurn && (
            <>
              {shouldDraw ? (
                <button
                  onClick={onDraw}
                  disabled={processingAction}
                  className="px-6 sm:px-8 py-2 sm:py-3 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  {processingAction ? 'Drawing...' : <>Draw Tile <span className="text-xs opacity-60 ml-1">(Space)</span></>}
                </button>
              ) : (
                <button
                  onClick={onDiscard}
                  disabled={processingAction || !selectedTile}
                  className="px-6 sm:px-8 py-2 sm:py-3 bg-red-500 hover:bg-red-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  {selectedTile ? 'Discard' : 'Select a tile'}
                </button>
              )}
            </>
          )}

          {/* Waiting for other players - show when it's not my turn and not calling phase */}
          {gameState.phase === 'playing' && !isMyTurn && !isCallingPhase && (
            <div className="text-slate-500 text-sm">
              Waiting for {getPlayerName(room, gameState.currentPlayerSeat)}...
            </div>
          )}
        </div>
      </div>
      {/* End of Primary Hand Section */}

      {/* ========== MIDDLE ROW: TURN INDICATOR + PREVIOUS ACTION + LAST DISCARD + DISCARD PILE ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 mb-2 sm:mb-3">
        {/* Turn Indicator + Previous Action + Last Discard - Left half on desktop */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Turn Indicator */}
          <TurnIndicator
            currentActor={currentActor}
            previousActor={previousActor}
            mySeat={mySeat!}
          />

          {/* Previous Action */}
          <div className={`rounded-xl p-2 sm:p-4 border flex flex-col items-center justify-center ${
            gameState.previousAction
              ? 'bg-blue-500/20 border-blue-500/40'
              : 'bg-slate-800/50 border-slate-600'
          }`}>
            {gameState.previousAction ? (
              <>
                <span className="text-blue-300 text-xs sm:text-lg font-medium mb-1 sm:mb-2">
                  {gameState.previousAction.type === 'draw' ? 'Drew' :
                   gameState.previousAction.type === 'pung' ? 'Peng' :
                   gameState.previousAction.type === 'chow' ? 'Chi' :
                   gameState.previousAction.type === 'kong' ? (gameState.previousAction.isConcealed ? 'Concealed Gang' : 'Gang') : 'Action'}
                </span>
                {/* For concealed kong, show face-down tiles to hide tile identity */}
                {gameState.previousAction.type === 'kong' && gameState.previousAction.isConcealed && (
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3].map((idx) => (
                      <div key={idx} className="w-6 h-8 sm:w-8 sm:h-10 bg-green-700 rounded border border-green-600 flex items-center justify-center">
                        <span className="text-green-300 text-xs">?</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* For calls (pung/chow/exposed kong), show the full meld with called tile highlighted */}
                {gameState.previousAction.tile && (gameState.previousAction.type === 'pung' || gameState.previousAction.type === 'chow' || gameState.previousAction.type === 'kong') && (() => {
                  const melds = gameState.exposedMelds[`seat${gameState.previousAction.playerSeat}` as keyof typeof gameState.exposedMelds];
                  const lastMeld = melds[melds.length - 1];
                  if (lastMeld) {
                    return (
                      <div className="flex gap-0.5">
                        {lastMeld.tiles.map((tileId, idx) => (
                          <div
                            key={idx}
                            className={`${tileId === lastMeld.calledTile ? 'ring-2 ring-yellow-400 rounded' : ''}`}
                          >
                            <Tile tileId={tileId} goldTileType={gameState.goldTileType} size="sm" />
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return <Tile tileId={gameState.previousAction.tile} goldTileType={gameState.goldTileType} size="md" />;
                })()}
                <span className="text-white text-xs sm:text-lg mt-1 sm:mt-2">by <span className="font-semibold">{getPlayerName(room, gameState.previousAction.playerSeat)}</span></span>
              </>
            ) : (
              <span className="text-slate-400 text-sm sm:text-lg">-</span>
            )}
          </div>

          {/* Last Discard */}
          <div className={`rounded-xl p-2 sm:p-4 border flex flex-col items-center justify-center ${
            gameState.lastAction?.type === 'discard' && gameState.lastAction.tile
              ? 'bg-red-500/20 border-red-500/40'
              : 'bg-slate-800/50 border-slate-600'
          }`}>
            {gameState.lastAction?.type === 'discard' && gameState.lastAction.tile ? (
              <>
                <span className="text-red-300 text-xs sm:text-lg font-medium mb-1 sm:mb-2">Discarded</span>
                <Tile tileId={gameState.lastAction.tile} goldTileType={gameState.goldTileType} size="md" />
                <span className="text-white text-xs sm:text-lg mt-1 sm:mt-2">by <span className="font-semibold">{getPlayerName(room, gameState.lastAction.playerSeat)}</span></span>
              </>
            ) : (
              <span className="text-slate-400 text-sm sm:text-lg">-</span>
            )}
          </div>
        </div>

        {/* Discard Pile - Middle column */}
        <DiscardPile
          discardPile={gameState.discardPile || []}
          goldTileType={gameState.goldTileType}
        />

      </div>

      {/* ========== ALL PLAYERS - TURN ORDER ========== */}
      <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
        <div className="grid grid-cols-[0.33fr_1fr_1fr_1fr] gap-1 sm:gap-2">
          {/* Order: current player first, then next 3 in turn order */}
          {[0, 1, 2, 3].map((offset) => {
            const seat = ((mySeat + offset) % 4) as SeatIndex;
            const player = room.players[`seat${seat}` as keyof typeof room.players];
            if (!player) return null;

            const isMe = seat === mySeat;
            const isDealer = gameState.dealerSeat === seat;
            const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
            const bonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];
            const isCurrentTurn = gameState.currentPlayerSeat === seat;
            // Total tiles = 16 base + 1 per kong (replacement draw) + 1 if needs to discard
            const kongCount = exposedMelds.filter(m => m.type === 'kong').length;
            const needsDiscard = isCurrentTurn && !needsToDraw(gameState);
            const totalTiles = 16 + kongCount + (needsDiscard ? 1 : 0);
            const tilesInMelds = exposedMelds.reduce((sum, meld) => sum + meld.tiles.length, 0);
            const tileCount = totalTiles - tilesInMelds;

            // Narrow cell for current player (first column)
            if (isMe) {
              return (
                <div
                  key={seat}
                  className={`p-1.5 sm:p-2 rounded-lg text-center ${
                    isCurrentTurn
                      ? 'bg-emerald-500/25 border-2 border-emerald-500/50'
                      : 'bg-blue-500/15 border border-blue-500/30'
                  }`}
                >
                  <div className={`font-semibold text-xs sm:text-sm ${isCurrentTurn ? 'text-emerald-200' : 'text-blue-200'}`}>
                    You
                  </div>
                  {isDealer && <span className="bg-amber-500 text-black text-[10px] sm:text-xs px-1 py-0.5 rounded font-bold">D</span>}
                </div>
              );
            }

            return (
              <div
                key={seat}
                className={`p-1.5 sm:p-2 rounded-lg ${
                  isCurrentTurn
                    ? 'bg-emerald-500/25 border-2 border-emerald-500/50'
                    : 'bg-slate-700/40 border border-slate-600'
                }`}
              >
                {/* Player info */}
                <div className="flex flex-col mb-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {player.isBot && <span className="text-cyan-400 text-xs sm:text-sm">🤖</span>}
                    <span className={`font-semibold text-xs sm:text-sm truncate ${isCurrentTurn ? 'text-emerald-200' : 'text-white'}`}>
                      {player.name}
                    </span>
                    {isDealer && <span className="bg-amber-500 text-black text-[10px] sm:text-xs px-1 py-0.5 rounded font-bold">D</span>}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[10px] sm:text-xs">
                    <span>{tileCount}</span>
                    {player.isBot && player.botDifficulty && (
                      <>
                        <span>·</span>
                        <span className={
                          player.botDifficulty === 'easy' ? 'text-green-400' :
                          player.botDifficulty === 'hard' ? 'text-red-400' :
                          'text-yellow-400'
                        }>
                          {player.botDifficulty.charAt(0).toUpperCase()}
                        </span>
                      </>
                    )}
                    {bonusTiles.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400 font-bold">+{bonusTiles.length}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Melds */}
                {exposedMelds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 mt-1">
                    {exposedMelds.map((meld, meldIdx) => (
                      <div key={meldIdx} className={`flex items-center gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-blue-900/50' : 'bg-slate-800/70'}`}>
                        {meld.tiles.length === 4 ? (
                          <>
                            <Tile tileId={meld.tiles[0]} goldTileType={gameState.goldTileType} size="sm" faceDown={meld.isConcealed} />
                            <span className="bg-amber-500 text-black text-[10px] px-1 py-0.5 rounded font-bold">×4</span>
                          </>
                        ) : (
                          meld.tiles.map((tile, i) => (
                            <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" faceDown={meld.isConcealed} />
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Calling phase: show who's left to respond (desktop only - mobile shows in bottom bar) */}
      {isCallingPhase && gameState.pendingCalls && (
        <div className="hidden md:flex bg-slate-700/40 rounded-lg px-3 py-2 mt-2 items-center justify-center gap-2 sm:gap-3 text-sm flex-wrap">
          {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
            const call = gameState.pendingCalls?.[`seat${seat}` as keyof typeof gameState.pendingCalls];
            const playerName = room.players[`seat${seat}` as keyof typeof room.players]?.name || SEAT_LABELS[seat];
            const isDiscarder = call === 'discarder';
            // Firebase doesn't store null, so undefined means waiting
            const isWaiting = !call;
            const hasResponded = !!call && call !== 'discarder';

            return (
              <div
                key={seat}
                className={`px-2 py-1 rounded ${
                  isDiscarder
                    ? 'bg-slate-600/50 text-slate-400'
                    : hasResponded
                    ? 'bg-emerald-500/30 text-emerald-300'
                    : isWaiting
                    ? 'bg-orange-500/30 text-orange-300 animate-pulse'
                    : 'bg-slate-600/50 text-slate-400'
                }`}
              >
                {playerName}
                {isDiscarder && <span className="ml-1 text-xs opacity-60">—</span>}
                {hasResponded && <span className="ml-1">✓</span>}
                {isWaiting && <span className="ml-1">...</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ========== GAME LOG ========== */}
      <GameLog
        entries={gameState.actionLog || []}
        transformEntry={(entry) => transformLogEntry(entry, room, mySeat)}
      />

      {/* Mobile Bottom Action Bar */}
      <MobileActionBar
        gamePhase={gameState.phase}
        isCallingPhase={isCallingPhase}
        isMyTurn={isMyTurn}
        shouldDraw={shouldDraw}
        myPendingCall={myPendingCall}
        hasRespondedToCalling={hasRespondedToCalling}
        myValidCalls={myValidCalls}
        pendingCalls={gameState.pendingCalls as Record<string, string> | null}
        chowSelectionMode={chowSelectionMode}
        selectedChowTiles={selectedChowTiles}
        kongSelectionMode={kongSelectionMode}
        combinedKongOptions={combinedKongOptions}
        focusedKongIndex={focusedKongIndex}
        canWinNow={canWinNow}
        selectedTile={selectedTile}
        processingAction={processingAction}
        currentPlayerSeat={gameState.currentPlayerSeat}
        mySeat={mySeat!}
        room={room}
        onCallResponse={onCallResponse}
        onChowClick={onChowClick}
        onCancelChow={onCancelChow}
        onConfirmChow={onConfirmChow}
        onDeclareWin={onDeclareWin}
        onKongKeyPress={onKongKeyPress}
        onCancelKongSelection={onCancelKongSelection}
        executeKongOption={executeKongOption}
        onDraw={onDraw}
        onDiscard={onDiscard}
        getPlayerName={getPlayerName}
      />

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        shortcuts={shortcuts}
        setShortcut={setShortcut}
        resetToDefaults={resetToDefaults}
        soundEnabled={soundEnabled}
        toggleSound={toggleSound}
        volume={volume}
        setVolume={setVolume}
        isHost={isHost}
        callingTimerSeconds={roomCallingTimerSeconds}
        setCallingTimerSeconds={setCallingTimerSeconds}
        turnTimerSeconds={roomTurnTimerSeconds}
        setTurnTimerSeconds={setTurnTimerSeconds}
        isGameActive={gameState?.phase === 'playing' || gameState?.phase === 'calling'}
        onAbort={async () => {
          const result = await abortGame(roomCode);
          if (!result.success) {
            alert(result.error || 'Failed to abort game');
          }
        }}
      />

      {/* Score Edit Modal (Host Only) */}
      <ScoreEditModal
        isOpen={showScoreEdit}
        onClose={() => setShowScoreEdit(false)}
        players={([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
          const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
          // Compute cumulative "Won" from rounds + adjustments
          let won = 0;
          for (const round of sessionScores?.rounds || []) {
            if (round.winnerSeat === seat && round.score > 0) {
              won += round.score;
            }
          }
          const existingAdjustments = sessionScores?.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
          won += existingAdjustments[`seat${seat}` as keyof typeof existingAdjustments] || 0;
          return {
            seatIndex: seat,
            name: player?.name || `Player ${seat + 1}`,
            currentWon: won,
          };
        })}
        onSave={async (adjustments) => {
          await adjustCumulativeScores(roomCode, adjustments);
        }}
      />

      {/* Debug Panel - Dev Mode Only */}
      {DEBUG_GAME && gameState?.phase === 'playing' && (
        <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-500 rounded-lg p-3 z-50 max-h-[80vh] overflow-y-auto">
          <div className="text-red-300 text-xs font-bold mb-2">🛠 DEBUG</div>
          <div className="flex flex-col gap-1">
            <div className="text-red-400 text-xs mt-1 mb-1">Test Wins:</div>
            <button
              onClick={() => triggerTestWin('normal')}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
            >
              Win (Normal)
            </button>
            <button
              onClick={() => triggerTestWin('selfDraw')}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
            >
              Win (Self-Draw)
            </button>
            <button
              onClick={() => triggerTestWin('threeGolds')}
              className="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 text-white text-xs rounded"
            >
              Win (3 Golds)
            </button>
            <button
              onClick={() => triggerTestWin('robbingGold')}
              className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white text-xs rounded"
            >
              Win (Rob Gold)
            </button>
            <div className="text-red-400 text-xs mt-2 mb-1">Win Sounds (click to loop):</div>
            {loopingSound && (
              <button
                onClick={() => toggleLoopSound(loopingSound)}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded mb-1"
              >
                ⏹ Stop
              </button>
            )}
            <button
              onClick={() => toggleLoopSound('win')}
              className={`px-2 py-1 ${loopingSound === 'win' ? 'bg-green-600' : 'bg-purple-700 hover:bg-purple-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'win' ? '🔊 ' : ''}Current
            </button>
            <button
              onClick={() => toggleLoopSound('winA')}
              className={`px-2 py-1 ${loopingSound === 'winA' ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'winA' ? '🔊 ' : ''}A: Chime
            </button>
            <button
              onClick={() => toggleLoopSound('winB')}
              className={`px-2 py-1 ${loopingSound === 'winB' ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'winB' ? '🔊 ' : ''}B: Gong
            </button>
            <button
              onClick={() => toggleLoopSound('winC')}
              className={`px-2 py-1 ${loopingSound === 'winC' ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'winC' ? '🔊 ' : ''}C: Sparkle
            </button>
            <button
              onClick={() => toggleLoopSound('winD')}
              className={`px-2 py-1 ${loopingSound === 'winD' ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'winD' ? '🔊 ' : ''}D: Victory
            </button>
            <button
              onClick={() => toggleLoopSound('winE')}
              className={`px-2 py-1 ${loopingSound === 'winE' ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-600'} text-white text-xs rounded`}
            >
              {loopingSound === 'winE' ? '🔊 ' : ''}E: Bell
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
