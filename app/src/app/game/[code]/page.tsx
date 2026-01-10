'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { useGame } from '@/hooks/useGame';
import { useBotRunner } from '@/hooks/useBotRunner';
import { useSounds } from '@/hooks/useSounds';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getTileType, getTileDisplayText, isBonusTile, isGoldTile, sortTilesForDisplay } from '@/lib/tiles';
import { calculateSettlement, calculateNetPositions } from '@/lib/settle';
import { SettingsModal } from '@/components/SettingsModal';
import { SeatIndex, TileId, TileType, CallAction } from '@/types';

// Debug logging - only enabled in development
const DEBUG_GAME = process.env.NODE_ENV === 'development';

// ============================================
// TILE COMPONENT
// ============================================

interface TileProps {
  tileId: TileId;
  goldTileType?: TileType;
  onClick?: () => void;
  selected?: boolean;
  isJustDrawn?: boolean;
  isChowValid?: boolean; // Valid for chow selection
  isChowSelected?: boolean; // Selected for chow
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function Tile({ tileId, goldTileType, onClick, selected, isJustDrawn, isChowValid, isChowSelected, disabled, size = 'md' }: TileProps) {
  const tileType = getTileType(tileId);
  const displayText = getTileDisplayText(tileType);
  const isGold = goldTileType && tileType === goldTileType;
  const isBonus = isBonusTile(tileId);

  // Get suit-specific text color
  const getSuitTextColor = () => {
    if (isBonus) return 'text-gray-800'; // Bonus tiles stay black
    if (tileType.startsWith('dots_')) return 'text-red-600';
    if (tileType.startsWith('bamboo_')) return 'text-blue-600';
    if (tileType.startsWith('characters_')) return 'text-green-600';
    return 'text-gray-800'; // Honors (winds/dragons) stay black
  };

  // Responsive tile sizes: smaller on mobile (< 640px)
  const sizeClasses = {
    sm: 'w-7 h-9 text-base sm:w-9 sm:h-11 sm:text-lg',           // Melds, bonus tiles
    md: 'w-10 h-12 text-xl sm:w-14 sm:h-[72px] sm:text-2xl',     // Discard pile, other player melds
    lg: 'w-12 h-14 text-2xl sm:w-16 sm:h-20 sm:text-3xl md:w-20 md:h-24 md:text-4xl',  // Player's hand
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick || disabled}
      className={`
        ${sizeClasses[size]}
        rounded-md border-2 font-bold
        flex items-center justify-center
        transition-all
        ${isGold
          ? 'bg-yellow-100 border-yellow-400'
          : 'bg-white border-gray-300'
        }
        ${getSuitTextColor()}
        ${selected ? 'ring-2 ring-blue-500 -translate-y-2' : ''}
        ${isJustDrawn ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]' : ''}
        ${isChowValid ? 'ring-2 ring-cyan-400' : ''}
        ${isChowSelected ? 'ring-2 ring-green-500 -translate-y-2 bg-green-100' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${onClick && !disabled ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}
      `}
    >
      {displayText}
    </button>
  );
}

// ============================================
// HAND COMPONENT
// ============================================

interface HandProps {
  tiles: TileId[];
  goldTileType?: TileType;
  onTileClick?: (tile: TileId) => void;
  selectedTile?: TileId | null;
  justDrawnTile?: TileId | null;
  size?: 'sm' | 'md' | 'lg';
}

function Hand({ tiles, goldTileType, onTileClick, selectedTile, justDrawnTile, size = 'lg' }: HandProps) {
  return (
    <div className="flex gap-1 flex-wrap justify-center">
      {tiles.map((tile, index) => {
        // Gold tiles cannot be discarded - disable click when in discard mode
        const isGold = goldTileType ? isGoldTile(tile, goldTileType) : false;
        const canClick = onTileClick && !isGold;

        return (
          <Tile
            key={`${tile}-${index}`}
            tileId={tile}
            goldTileType={goldTileType}
            size={size}
            onClick={canClick ? () => onTileClick(tile) : undefined}
            selected={selectedTile === tile}
            isJustDrawn={justDrawnTile === tile}
            disabled={!!onTileClick && isGold}
          />
        );
      })}
    </div>
  );
}

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;

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
    processBonusExposure,
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

  // Keyboard shortcuts
  const { shortcuts, setShortcut, resetToDefaults } = useKeyboardShortcuts();
  const [showSettings, setShowSettings] = useState(false);

  const [processingBonus, setProcessingBonus] = useState(false);
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Phase 8: Chow selection mode
  const [chowSelectionMode, setChowSelectionMode] = useState(false);
  const [selectedChowTiles, setSelectedChowTiles] = useState<TileId[]>([]);

  // Kong: Pung upgrade selection mode
  const [pungUpgradeMode, setPungUpgradeMode] = useState(false);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Toast message for errors
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Game log auto-scroll
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [gameState?.actionLog?.length]);

  // Handle bonus exposure when it's my turn
  const handleBonusExposure = async () => {
    if (processingBonus) return;

    setProcessingBonus(true);
    try {
      await processBonusExposure();
    } catch (err) {
      if (DEBUG_GAME) console.error('Bonus exposure failed:', err);
    } finally {
      setProcessingBonus(false);
    }
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
        playSound('win');
        if (DEBUG_GAME) console.log('Three Golds! You win!');
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Draw failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

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
        playSound('win');
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
        if (action === 'win') playSound('win');
        else if (action === 'pung') playSound('pung');
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
  };

  // Keyboard shortcut handler for game actions
  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      // Ignore if typing in input field or settings modal is open
      if (e.target instanceof HTMLInputElement || showSettings) return;
      // Don't fire if already processing an action
      if (processingAction) return;

      const key = e.key.toUpperCase();

      // Draw shortcut - during playing phase when it's my turn and I need to draw
      const isCurrentPlayersTurn = gameState?.currentPlayerSeat === mySeat;
      if (key === shortcuts.draw && gameState?.phase === 'playing' && isCurrentPlayersTurn && shouldDraw) {
        e.preventDefault();
        onDraw();
        return;
      }

      // Calling phase shortcuts
      if (!isCallingPhase || myPendingCall !== null || chowSelectionMode) return;

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
      } else if (key === shortcuts.pass) {
        e.preventDefault();
        onCallResponse('pass');
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
    // onCallResponse, onChowClick, onDraw are intentionally excluded - they're not memoized and would cause unnecessary re-registrations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallingPhase, myPendingCall, chowSelectionMode, processingAction, shortcuts, myValidCalls, showSettings, gameState?.phase, gameState?.currentPlayerSeat, mySeat, shouldDraw]);

  // Phase 8: Cancel chow selection
  const onCancelChow = () => {
    setChowSelectionMode(false);
    setSelectedChowTiles([]);
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
      // Already have 2 tiles selected - reset to this tile if valid
      if (validChowTiles.has(tile)) {
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

  // Kong: Declare concealed kong (4 of a kind in hand)
  const onConcealedKong = async (tileType: TileType) => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleConcealedKong(tileType);
      if (result.success) {
        playSound('pung'); // Use pung sound for kong
      } else {
        if (DEBUG_GAME) console.error('Concealed kong failed:', result.error);
        setToastMessage(result.error || 'Failed to declare kong');
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Concealed kong failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Kong: Enter pung upgrade selection mode
  const onPungUpgradeClick = () => {
    setPungUpgradeMode(true);
  };

  // Kong: Cancel pung upgrade selection
  const onCancelPungUpgrade = () => {
    setPungUpgradeMode(false);
  };

  // Kong: Confirm pung upgrade by clicking the tile
  const onConfirmPungUpgrade = async (tile: TileId) => {
    if (processingAction || pungUpgradeOptions.length === 0) return;

    // Find the upgrade option that matches this tile
    const option = pungUpgradeOptions.find(opt => opt.tileFromHand === tile);
    if (!option) return;

    setProcessingAction(true);
    try {
      const result = await handlePungUpgrade(option.meldIndex, option.tileFromHand);
      if (result.success) {
        playSound('pung'); // Use pung sound for kong
        setPungUpgradeMode(false);
      } else {
        if (DEBUG_GAME) console.error('Pung upgrade failed:', result.error);
        setToastMessage(result.error || 'Failed to upgrade to kong');
      }
    } catch (err) {
      if (DEBUG_GAME) console.error('Pung upgrade failed:', err);
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

  // Reset pung upgrade mode when options disappear or turn changes
  useEffect(() => {
    const isCurrentlyMyTurn = gameState?.currentPlayerSeat === mySeat;
    if (pungUpgradeOptions.length === 0 || !isCurrentlyMyTurn || gameState?.phase !== 'playing') {
      setPungUpgradeMode(false);
    }
  }, [pungUpgradeOptions, gameState?.currentPlayerSeat, mySeat, gameState?.phase]);

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

  // Calling phase: I have valid calls to make
  useEffect(() => {
    const hasValidCalls = !!(myValidCalls && (myValidCalls.canWin || myValidCalls.canKong || myValidCalls.canPung || myValidCalls.canChow));
    const justEnteredCalling = isCallingPhase && hasValidCalls && !prevCallingPhaseRef.current;

    if (justEnteredCalling && myPendingCall === null) {
      playSound('yourTurn');
      setShowTurnFlash(true);
      setTimeout(() => setShowTurnFlash(false), 1500);
    }
    prevCallingPhaseRef.current = isCallingPhase && hasValidCalls;
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

  // No game state
  if (!room || !gameState || mySeat === null) {
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
                <h3 className="text-lg font-semibold text-blue-400 mb-3">
                  Session Scores {sessionScores?.rounds ? `(Round ${sessionScores.rounds.length})` : ''}
                </h3>
                {sessionScores && sessionScores.rounds ? (() => {
                  const netPositions = calculateNetPositions(sessionScores.rounds || []);
                  const rawPoints: Record<string, number> = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                  for (const round of sessionScores.rounds || []) {
                    if (round.winnerSeat !== null && round.score > 0) {
                      rawPoints[`seat${round.winnerSeat}`] += round.score;
                    }
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
                        const net = netPositions[`seat${seat}`] || 0;
                        const won = rawPoints[`seat${seat}`] || 0;
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

              {/* Game Log */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <h3 className="text-lg font-semibold text-slate-300 mb-2">Game Log</h3>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {(gameState.actionLog || []).map((entry, index) => (
                    <div key={index} className="text-xs py-0.5 text-slate-400">
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-3 justify-center flex-wrap">
                {sessionScores && (
                  <button
                    onClick={() => setShowSettleModal(true)}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg text-lg"
                  >
                    Settle
                  </button>
                )}
                {room?.hostId === user?.uid ? (
                  <button
                    onClick={async () => {
                      // On draw, dealer stays
                      await startGame(gameState.dealerSeat);
                    }}
                    className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-lg"
                  >
                    Another Round (Dealer Stays)
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-8 py-3 bg-gray-600 text-gray-400 font-semibold rounded-lg cursor-not-allowed text-lg"
                  >
                    Another Round (Dealer Stays)
                  </button>
                )}
              </div>
              {room?.hostId !== user?.uid && (
                <p className="text-base text-slate-400">Waiting for host to start next round...</p>
              )}
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

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">
              {winner.isThreeGolds ? '🀄🀄🀄 THREE GOLDS!' : winner.isRobbingGold ? '💰 ROBBING THE GOLD!' : '🎉 Winner!'}
            </div>
            <div className="text-2xl font-bold text-amber-400">{winnerName}</div>
            <div className="text-lg text-slate-300">
              {winner.isThreeGolds
                ? 'Instant win with 3 Gold tiles!'
                : winner.isRobbingGold
                  ? 'Claimed the revealed Gold tile!'
                  : winner.isSelfDraw
                    ? 'Won by self-draw'
                    : `Won on ${discarderName}'s discard`}
            </div>
            {winner.seat === gameState.dealerSeat && (
              <div className="text-base text-orange-400 mt-1">
                {sessionScores?.dealerStreak && sessionScores.dealerStreak > 1
                  ? `🔥 Dealer on a ${sessionScores.dealerStreak}-win streak!`
                  : sessionScores?.dealerStreak === 1
                    ? '🔥 Dealer wins! Streak started'
                    : '🔥 Dealer wins!'}
              </div>
            )}
          </div>

          {/* Main content - 2 column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Left column - Hands */}
            <div className="space-y-4">
              {/* Winning Hand */}
              {winner.hand && (
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <h3 className="text-lg font-semibold text-amber-400 mb-3">Winning Hand</h3>

                  {/* All tiles in one row */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(() => {
                      const sortedHand = sortTilesForDisplay(winner.hand, gameState.goldTileType);
                      return sortedHand.map((tileId: string, index: number) => {
                        const isWinningTile = tileId === winner.winningTile;
                        return (
                          <div key={`hand-${index}`} className={`relative ${isWinningTile ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-700 rounded-md' : ''}`}>
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

                  {/* Exposed melds */}
                  {gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds]?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-400 text-sm">Called:</span>
                      {gameState.exposedMelds[`seat${winner.seat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                        <div key={`meld-${meldIndex}`} className={`flex gap-0.5 rounded p-1 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
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
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">Your Hand</h3>
                  <div className="flex flex-wrap gap-1 mb-3">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-400 text-sm">Called:</span>
                      {gameState.exposedMelds[`seat${mySeat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                        <div key={`my-meld-${meldIndex}`} className={`flex gap-0.5 rounded p-1 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
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
            <div className="space-y-4">
              {/* Score Breakdown */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Score Breakdown</h3>
                <div className="text-lg space-y-1">
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
                      <span>Concealed Kong:</span>
                      <span>+{winner.score.concealedKongBonus}</span>
                    </div>
                  )}
                  {winner.score.exposedKongBonus > 0 && (
                    <div className="flex justify-between text-pink-300">
                      <span>Exposed Kong:</span>
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
                  <div className="flex justify-between border-t border-slate-600 pt-2 font-bold text-xl text-amber-400">
                    <span>Total:</span>
                    <span>{winner.score.total}</span>
                  </div>
                </div>
              </div>

              {/* Cumulative Scores */}
              {sessionScores && sessionScores.rounds && (
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">
                    Session Scores (Round {sessionScores.rounds?.length || 1})
                  </h3>
                  {(() => {
                    const netPositions = calculateNetPositions(sessionScores.rounds || []);
                    const rawPoints: Record<string, number> = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                    for (const round of sessionScores.rounds || []) {
                      if (round.winnerSeat !== null && round.score > 0) {
                        rawPoints[`seat${round.winnerSeat}`] += round.score;
                      }
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
                          const net = netPositions[`seat${seat}`] || 0;
                          const won = rawPoints[`seat${seat}`] || 0;
                          const isWinnerSeat = winner.seat === seat;
                          return (
                            <div
                              key={seat}
                              className={`flex justify-between py-1 ${isWinnerSeat ? 'text-amber-400 font-semibold' : 'text-slate-200'}`}
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
                  })()}
                </div>
              )}

              {/* Game Log */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <h3 className="text-lg font-semibold text-slate-300 mb-2">Game Log</h3>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {(gameState.actionLog || []).map((entry, index) => (
                    <div key={index} className="text-sm py-0.5 text-slate-300">
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons - centered at bottom */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-3 justify-center flex-wrap">
              {sessionScores && (
                <button
                  onClick={() => setShowSettleModal(true)}
                  className="px-8 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg text-lg"
                >
                  Settle
                </button>
              )}
              {room?.hostId === user?.uid ? (
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
                  className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-lg"
                >
                  {winner && winner.seat === gameState.dealerSeat
                    ? 'Another Round (Dealer Stays)'
                    : 'Another Round'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-8 py-3 bg-gray-600 text-gray-400 font-semibold rounded-lg cursor-not-allowed text-lg"
                >
                  {winner && winner.seat === gameState.dealerSeat
                    ? 'Another Round (Dealer Stays)'
                    : 'Another Round'}
                </button>
              )}
            </div>
            {room?.hostId !== user?.uid && (
              <p className="text-base text-slate-400">Waiting for host to start next round...</p>
            )}
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
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.currentPlayerSeat === mySeat;
  const isBonusPhase = gameState.phase === 'bonus_exposure';

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
      <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2 mb-2 sm:mb-3 bg-slate-700/40 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Rules tooltip */}
          <div className="relative group">
            <button className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white text-sm sm:text-lg font-bold flex items-center justify-center">
              ?
            </button>
            <div className="absolute left-0 top-full mt-2 w-[280px] sm:w-[420px] max-h-[80vh] overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg p-3 sm:p-4 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <h3 className="text-amber-400 font-bold text-lg mb-3">How to Play</h3>
              <div className="text-base text-slate-300 space-y-2">
                <p><strong className="text-white">Goal:</strong> Form a winning hand of 5 sets + 1 pair (17 tiles total)</p>
                <p><strong className="text-white">Sets:</strong> Either 3 of a kind (Pung) or 3 in a row of the same suit (Chow)</p>
                <p><strong className="text-white">Gold Tile:</strong> Acts as a wildcard - can substitute for any suited tile</p>
                <p><strong className="text-white">Bonus Tiles:</strong> Winds and dragons are exposed at the start for extra points</p>
                <p><strong className="text-white">On Your Turn:</strong> Draw a tile, then discard one (click to select, then click Discard)</p>
                <p><strong className="text-white">Calling:</strong> When someone discards, you can call Pung (3 of a kind) or Chow (sequence) if you have matching tiles</p>
                <p><strong className="text-white">Winning:</strong> Click WIN when your hand is complete!</p>
              </div>

              <hr className="border-slate-600 my-3" />

              <h4 className="text-amber-400 font-bold text-lg mb-3">Detailed Rules</h4>
              <div className="text-base text-slate-300 space-y-2">
                <p><strong className="text-white">Turn Order:</strong> Play goes counter-clockwise (East → North → West → South)</p>
                <p><strong className="text-white">Starting Tiles:</strong> Dealer receives 17 tiles, others receive 16. Dealer discards first without drawing.</p>
                <p><strong className="text-white">Gold Tiles:</strong> Cannot be discarded - you must keep them. They can substitute for any suited tile (dots, bamboo, characters) in sets and pairs.</p>
                <p><strong className="text-white">Three Golds:</strong> If you ever hold 3 Gold tiles, you instantly win with a bonus!</p>
                <p><strong className="text-white">Chow Restriction:</strong> You can only call Chow on a discard from the player immediately before you (your right).</p>
                <p><strong className="text-white">Pung Priority:</strong> Pung can be called on anyone&apos;s discard, and takes priority over Chow.</p>
                <p><strong className="text-white">Win Priority:</strong> A winning call (WIN) takes priority over all other calls.</p>
                <p><strong className="text-white">Scoring:</strong> Base points + bonus tiles + Gold tiles in hand. Self-draw wins get 2x multiplier.</p>
                <p><strong className="text-white">Suits:</strong> Dots (red ●), Bamboo (blue |), Characters (green 萬). Each suit has tiles 1-9.</p>
                <p><strong className="text-white">Honors:</strong> Winds (東南西北) and Dragons (中) are bonus tiles - expose them for points but they can&apos;t form Chows.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-slate-400 text-sm sm:text-lg">Room</span>
            <span className="font-mono text-amber-400 font-bold text-sm sm:text-base">{roomCode}</span>
          </div>
          {gameState.goldTileType && gameState.exposedGold && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-sm sm:text-lg hidden sm:inline">Gold</span>
              <Tile tileId={gameState.exposedGold} goldTileType={gameState.goldTileType} size="sm" />
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-sm sm:text-lg">Wall</span>
            <span className="font-mono text-white text-sm sm:text-base">{gameState.wall?.length ?? 0}</span>
          </div>
          {/* Sound controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSound}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white text-sm sm:text-lg flex items-center justify-center"
              title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            {soundEnabled && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-12 sm:w-16 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                title={`Volume: ${Math.round(volume * 100)}%`}
              />
            )}
          </div>
          {/* Settings button */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white flex items-center justify-center"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        {/* Phase indicator - right side */}
        <div className={`px-2 sm:px-3 py-1 rounded-md text-sm sm:text-lg font-medium ${
          isBonusPhase ? 'bg-blue-500/40 text-blue-200' :
          isCallingPhase ? 'bg-orange-500/40 text-orange-200' :
          isMyTurn ? 'bg-emerald-500/40 text-emerald-200' : 'bg-slate-600/60 text-slate-300'
        }`}>
          {isBonusPhase ? (isMyTurn ? '▶ Expose Bonus' : `${SEAT_LABELS[gameState.currentPlayerSeat]} exposing...`) :
           isCallingPhase ? (chowSelectionMode ? 'Select Chow tiles' : 'Calling...') :
           isMyTurn ? (shouldDraw ? '▶ Draw a tile' : '▶ Discard a tile') :
           `${SEAT_LABELS[gameState.currentPlayerSeat]}'s turn`}
        </div>
      </div>

      {/* Calling phase: show who's left to respond */}
      {isCallingPhase && gameState.pendingCalls && (
        <div className="bg-slate-700/40 rounded-lg px-3 py-2 mb-2 flex items-center justify-center gap-2 sm:gap-3 text-sm flex-wrap">
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

      {/* ========== YOUR HAND SECTION ========== */}
      <div className="bg-slate-700/60 rounded-xl p-2 sm:p-3 mb-2 sm:mb-3 border border-slate-600">
        {/* Header row: Name + Melds + Bonus */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 text-sm sm:text-lg">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium">{room.players[`seat${mySeat}` as keyof typeof room.players]?.name || 'You'}</span>
            <span className="text-slate-500 text-xs sm:text-base">({SEAT_LABELS[mySeat]})</span>
            {gameState.dealerSeat === mySeat && <span className="bg-amber-500 text-black text-xs px-1 sm:px-1.5 py-0.5 rounded font-bold">D</span>}
          </div>
          {/* Melds inline */}
          {(gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || []).length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500 text-xs sm:text-base">Melds:</span>
              {(gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || []).map((meld, meldIdx) => (
                <div key={meldIdx} className={`flex gap-0.5 rounded px-1 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/50'}`}>
                  {meld.tiles.map((tile, i) => <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />)}
                  {meld.isConcealed && <span className="text-pink-300 text-[10px] ml-0.5 self-center">C</span>}
                </div>
              ))}
            </div>
          )}
          {/* Bonus inline */}
          {(gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []).length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500 text-xs sm:text-base">Bonus:</span>
              {(gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []).map((tile, i) => (
                <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />
              ))}
            </div>
          )}
          <span className="text-slate-500 text-xs sm:text-base ml-auto">{myHand.length} tiles</span>
        </div>

        {/* Hand tiles */}
        {chowSelectionMode ? (
          // Chow selection mode - show tiles with chow highlighting
          <div className="flex gap-1 flex-wrap justify-center">
            {myHand.map((tile, index) => {
              const isValidFirst = validChowTiles.has(tile);
              const isSelected = selectedChowTiles.includes(tile);
              const isValidSecond = selectedChowTiles.length === 1 &&
                (validChowTiles.get(selectedChowTiles[0]) || []).includes(tile);
              const canClick = isValidFirst || isValidSecond;

              return (
                <Tile
                  key={`${tile}-${index}`}
                  tileId={tile}
                  goldTileType={gameState.goldTileType}
                  size="lg"
                  onClick={canClick ? () => onChowTileClick(tile) : undefined}
                  isChowValid={selectedChowTiles.length === 0 ? isValidFirst : isValidSecond}
                  isChowSelected={isSelected}
                  disabled={!canClick && !isSelected}
                />
              );
            })}
          </div>
        ) : pungUpgradeMode && pungUpgradeOptions.length > 0 ? (
          // Pung upgrade selection mode - highlight ALL tiles that can be used for upgrades
          <div className="flex gap-1 flex-wrap justify-center">
            {myHand.map((tile, index) => {
              const isUpgradeTile = pungUpgradeOptions.some(opt => opt.tileFromHand === tile);
              return (
                <Tile
                  key={`${tile}-${index}`}
                  tileId={tile}
                  goldTileType={gameState.goldTileType}
                  size="lg"
                  onClick={isUpgradeTile ? () => onConfirmPungUpgrade(tile) : undefined}
                  isChowValid={isUpgradeTile}
                  isChowSelected={isUpgradeTile}
                  disabled={!isUpgradeTile}
                />
              );
            })}
          </div>
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

        {/* Action Buttons - inside the hand section */}
        <div className="mt-2 sm:mt-4 flex flex-wrap justify-center gap-2 sm:gap-3">
          {/* Bonus exposure button */}
          {isBonusPhase && isMyTurn && (
            <button
              onClick={handleBonusExposure}
              disabled={processingBonus}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-500 text-black font-bold rounded-lg text-sm sm:text-base"
            >
              {processingBonus ? 'Processing...' : 'Expose Bonus Tiles'}
            </button>
          )}

          {/* Call buttons during calling phase */}
          {isCallingPhase && myPendingCall === null && !chowSelectionMode && (
            <>
              {myValidCalls?.canWin && (
                <button
                  onClick={() => onCallResponse('win')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm sm:text-base"
                >
                  WIN! <span className="text-xs opacity-60 ml-1">({shortcuts.win})</span>
                </button>
              )}
              {myValidCalls?.canKong && (
                <button
                  onClick={() => onCallResponse('kong')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  KONG <span className="text-xs opacity-60 ml-1">({shortcuts.kong})</span>
                </button>
              )}
              {myValidCalls?.canPung && (
                <button
                  onClick={() => onCallResponse('pung')}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  PUNG <span className="text-xs opacity-60 ml-1">({shortcuts.pung})</span>
                </button>
              )}
              {myValidCalls?.canChow && (
                <button
                  onClick={onChowClick}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  CHOW <span className="text-xs opacity-60 ml-1">({shortcuts.chow})</span>
                </button>
              )}
              <button
                onClick={() => onCallResponse('pass')}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-600 hover:bg-slate-500 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                PASS <span className="text-xs opacity-60 ml-1">({shortcuts.pass})</span>
              </button>
            </>
          )}

          {/* Chow selection mode buttons */}
          {isCallingPhase && chowSelectionMode && (
            <>
              <button
                onClick={onConfirmChow}
                disabled={selectedChowTiles.length !== 2 || processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Confirm Chow ({selectedChowTiles.length}/2)
              </button>
              <button
                onClick={onCancelChow}
                disabled={processingAction}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm sm:text-base"
              >
                Cancel
              </button>
            </>
          )}

          {/* Waiting status */}
          {isCallingPhase && myPendingCall !== null && myPendingCall !== 'discarder' && (
            <div className="px-3 sm:px-4 py-2 bg-slate-600/50 rounded-lg text-sm sm:text-lg">
              <span className="text-slate-300">You chose </span>
              <span className="text-white font-bold uppercase">{myPendingCall}</span>
              <span className="text-slate-400 animate-pulse ml-2">waiting...</span>
            </div>
          )}

          {/* Win buttons */}

          {gameState.phase === 'playing' && isMyTurn && !shouldDraw && canWinNow && (
            <button
              onClick={onDeclareWin}
              disabled={processingAction}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm sm:text-base"
            >
              🎉 WIN!
            </button>
          )}

          {/* Kong buttons during playing phase (after drawing) */}
          {gameState.phase === 'playing' && isMyTurn && !shouldDraw && (
            <>
              {/* Concealed Kong button - show if player has 4 of a kind */}
              {concealedKongOptions.length > 0 && concealedKongOptions.map((tileType) => (
                <button
                  key={`kong-${tileType}`}
                  onClick={() => onConcealedKong(tileType)}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  KONG ({getTileDisplayText(tileType)})
                </button>
              ))}
              {/* Pung upgrade button - show if player can upgrade a pung */}
              {pungUpgradeOptions.length > 0 && !pungUpgradeMode && (
                <button
                  onClick={onPungUpgradeClick}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  UPGRADE
                </button>
              )}
              {/* Pung upgrade selection mode - cancel button (click tile to confirm) */}
              {pungUpgradeMode && pungUpgradeOptions.length > 0 && (
                <button
                  onClick={onCancelPungUpgrade}
                  disabled={processingAction}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm sm:text-base"
                >
                  Cancel
                </button>
              )}
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
                  {processingAction ? 'Drawing...' : <>Draw Tile <span className="text-xs opacity-60 ml-1">({shortcuts.draw})</span></>}
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
        </div>
      </div>
      {/* End of Primary Hand Section */}

      {/* ========== MIDDLE ROW: GAME LOG + LAST DISCARD + DISCARD PILE ========== */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_auto_3fr] gap-2 sm:gap-3 mb-2 sm:mb-3">
        {/* Game Log */}
        <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
          <div className="text-sm sm:text-lg text-slate-300 font-medium mb-2 sm:mb-3">Game Log</div>
          <div ref={logRef} className="max-h-28 sm:max-h-40 overflow-y-auto space-y-0.5 sm:space-y-1">
            {(gameState.actionLog || []).map((entry, index, arr) => (
              <div
                key={index}
                className={`text-xs sm:text-lg py-0.5 ${index === arr.length - 1 ? 'text-white font-medium' : 'text-slate-300'}`}
              >
                {entry}
              </div>
            ))}
          </div>
        </div>

        {/* Last Discard - Center column */}
        <div className={`rounded-xl p-2 sm:p-4 border flex flex-col items-center justify-center ${
          gameState.lastAction?.type === 'discard' && gameState.lastAction.tile
            ? 'bg-red-500/20 border-red-500/40'
            : 'bg-slate-800/50 border-slate-600'
        }`}>
          {gameState.lastAction?.type === 'discard' && gameState.lastAction.tile ? (
            <>
              <span className="text-red-300 text-xs sm:text-lg font-medium mb-1 sm:mb-2">Last Discard</span>
              <Tile tileId={gameState.lastAction.tile} goldTileType={gameState.goldTileType} size="md" />
              <span className="text-white text-xs sm:text-lg mt-1 sm:mt-2">by <span className="font-semibold">{SEAT_LABELS[gameState.lastAction.playerSeat]}</span></span>
            </>
          ) : (
            <span className="text-slate-400 text-sm sm:text-lg">No discard yet</span>
          )}
        </div>

        {/* Discard Pile */}
        <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
          <div className="text-sm sm:text-lg text-slate-300 font-medium mb-2 sm:mb-3 flex items-center justify-between">
            <span>Discard Pile</span>
            <span className="text-slate-400 text-xs sm:text-base">{gameState.discardPile?.length || 0} tiles</span>
          </div>
          {gameState.discardPile?.length > 0 ? (
            <div className="flex gap-1 sm:gap-1.5 flex-wrap">
              {(() => {
                const tileCounts = new Map<string, { tileId: TileId; count: number }>();
                gameState.discardPile.forEach((tile) => {
                  const tileType = getTileType(tile);
                  const existing = tileCounts.get(tileType);
                  if (existing) existing.count++;
                  else tileCounts.set(tileType, { tileId: tile, count: 1 });
                });
                return Array.from(tileCounts.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([tileType, { tileId, count }]) => (
                    <div key={tileType} className="relative">
                      <Tile tileId={tileId} goldTileType={gameState.goldTileType || ''} size="sm" />
                      {count > 1 && (
                        <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 bg-red-500 text-white text-[10px] sm:text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-bold">
                          {count}
                        </span>
                      )}
                    </div>
                  ));
              })()}
            </div>
          ) : (
            <div className="text-slate-400 text-sm sm:text-lg">No discards yet</div>
          )}
        </div>
      </div>

      {/* ========== OTHER PLAYERS WITH MELDS ========== */}
      <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
        <div className="text-sm sm:text-lg text-slate-300 font-medium mb-2 sm:mb-3">Other Players</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {([0, 1, 2, 3] as SeatIndex[])
            .filter((seat) => seat !== mySeat)
            .map((seat) => {
              const player = room.players[`seat${seat}` as keyof typeof room.players];
              if (!player) return null;

              const isDealer = gameState.dealerSeat === seat;
              const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
              const bonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];
              const baseTileCount = isDealer ? 17 : 16;
              // Calculate tiles removed from hand: 2 for most melds, 3 for concealed kong (4 removed, +1 replacement draw)
              const tilesRemovedFromHand = exposedMelds.reduce((sum, meld) => {
                return sum + (meld.type === 'kong' && meld.isConcealed ? 3 : 2);
              }, 0);
              const tileCount = baseTileCount - tilesRemovedFromHand;
              const isCurrentTurn = gameState.currentPlayerSeat === seat;

              return (
                <div
                  key={seat}
                  className={`p-2 sm:p-3 rounded-lg ${isCurrentTurn ? 'bg-emerald-500/25 border-2 border-emerald-500/50' : 'bg-slate-700/40 border border-slate-600'}`}
                >
                  {/* Player info row */}
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {player.isBot && <span className="text-cyan-400 text-sm sm:text-lg">🤖</span>}
                      <span className={`font-semibold text-sm sm:text-lg ${isCurrentTurn ? 'text-emerald-200' : 'text-white'}`}>
                        {player.name}
                      </span>
                      <span className="text-slate-400 text-xs sm:text-base">({SEAT_LABELS[seat]})</span>
                      {player.isBot && player.botDifficulty && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          player.botDifficulty === 'easy' ? 'bg-green-500/30 text-green-300' :
                          player.botDifficulty === 'hard' ? 'bg-red-500/30 text-red-300' :
                          'bg-yellow-500/30 text-yellow-300'
                        }`}>
                          {player.botDifficulty.charAt(0).toUpperCase() + player.botDifficulty.slice(1)}
                        </span>
                      )}
                      {isDealer && <span className="bg-amber-500 text-black text-xs sm:text-lg px-1 sm:px-1.5 py-0.5 rounded font-bold">D</span>}
                    </div>
                    <span className="text-slate-300 font-medium text-xs sm:text-base">{tileCount} tiles</span>
                  </div>
                  {/* Melds and bonus tiles */}
                  {(exposedMelds.length > 0 || bonusTiles.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1 sm:mt-2">
                      {exposedMelds.map((meld, meldIdx) => (
                        <div key={meldIdx} className={`flex gap-0.5 rounded p-0.5 sm:p-1 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
                          {meld.tiles.map((tile, i) => (
                            <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />
                          ))}
                          {meld.isConcealed && <span className="text-pink-300 text-[10px] ml-0.5 self-center">C</span>}
                        </div>
                      ))}
                      {bonusTiles.length > 0 && (
                        <div className="bg-amber-500/30 rounded px-2 sm:px-3 py-0.5 sm:py-1 flex items-center gap-1">
                          <span className="text-amber-300 text-xs sm:text-lg">Bonus:</span>
                          <span className="text-amber-400 text-lg sm:text-2xl font-bold">+{bonusTiles.length}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        shortcuts={shortcuts}
        setShortcut={setShortcut}
        resetToDefaults={resetToDefaults}
      />
    </div>
  );
}
