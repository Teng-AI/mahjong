'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { useGame } from '@/hooks/useGame';
import { getTileType, getTileDisplayText, isBonusTile, isGoldTile, sortTilesForDisplay } from '@/lib/tiles';
import { calculateSettlement, calculateNetPositions } from '@/lib/settle';
import { SeatIndex, TileId, TileType, Meld, CallAction, PendingCall, PendingCalls, Settlement } from '@/types';

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

  const sizeClasses = {
    sm: 'w-8 h-10 text-sm',
    md: 'w-10 h-14 text-lg',
    lg: 'w-12 h-16 text-xl',
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
          ? 'bg-yellow-400 border-yellow-600 text-yellow-900'
          : isBonus
            ? 'bg-green-200 border-green-400 text-green-800'
            : 'bg-white border-gray-300 text-gray-800'
        }
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
}

function Hand({ tiles, goldTileType, onTileClick, selectedTile, justDrawnTile }: HandProps) {
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

// ============================================
// BONUS TILES DISPLAY
// ============================================

interface BonusTilesProps {
  tiles: TileId[];
  label: string;
}

function BonusTilesDisplay({ tiles, label }: BonusTilesProps) {
  if (tiles.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-green-300">{label}:</span>
      <div className="flex gap-0.5">
        {tiles.map((tile, index) => (
          <Tile key={`${tile}-${index}`} tileId={tile} size="sm" />
        ))}
      </div>
    </div>
  );
}

// ============================================
// PLAYER INFO COMPONENT
// ============================================

interface PlayerInfoProps {
  seat: SeatIndex;
  name: string;
  isDealer: boolean;
  isCurrentTurn: boolean;
  bonusTiles: TileId[];
  exposedMelds: Meld[];
  tileCount: number;
  isSelf: boolean;
}

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;

function PlayerInfo({
  seat,
  name,
  isDealer,
  isCurrentTurn,
  bonusTiles,
  exposedMelds,
  tileCount,
  isSelf,
}: PlayerInfoProps) {
  return (
    <div
      className={`
        p-3 rounded-lg
        ${isCurrentTurn ? 'bg-yellow-500/20 ring-2 ring-yellow-500' : 'bg-green-800/30'}
        ${isSelf ? 'ring-2 ring-blue-400' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400">{SEAT_LABELS[seat]}</span>
          <span className="font-semibold">{name}</span>
          {isSelf && <span className="text-xs text-blue-300">(You)</span>}
        </div>
        <div className="flex items-center gap-2">
          {isDealer && (
            <span className="px-2 py-0.5 bg-yellow-500 text-black rounded text-xs font-bold">
              DEALER
            </span>
          )}
          <span className="text-xs text-green-400">{tileCount} tiles</span>
        </div>
      </div>

      {/* Exposed melds */}
      {exposedMelds.length > 0 && (
        <div className="flex gap-2 mb-2">
          {exposedMelds.map((meld, idx) => (
            <div key={idx} className="flex gap-0.5">
              {meld.tiles.map((tile, tileIdx) => (
                <Tile key={`${tile}-${tileIdx}`} tileId={tile} size="sm" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Bonus tiles */}
      <BonusTilesDisplay tiles={bonusTiles} label="Bonus" />
    </div>
  );
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
    canWinOnLastDiscard,
    handleSelfDrawWin,
    handleDiscardWin,
    // Phase 8: Calling system
    isCallingPhase,
    myPendingCall,
    myValidCalls,
    validChowTiles,
    isNextInTurn,
    handleCallResponse,
  } = useGame({
    roomCode,
    mySeat,
  });

  const [processingBonus, setProcessingBonus] = useState(false);
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Phase 8: Chow selection mode
  const [chowSelectionMode, setChowSelectionMode] = useState(false);
  const [selectedChowTiles, setSelectedChowTiles] = useState<TileId[]>([]);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);

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
      console.error('Bonus exposure failed:', err);
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
      if (result.wallEmpty) {
        console.log('Wall exhausted - game ends in draw');
      }
      if (result.threeGoldsWin) {
        console.log('Three Golds! You win!');
      }
    } catch (err) {
      console.error('Draw failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle discarding a tile
  const onDiscard = async () => {
    if (processingAction || !selectedTile) return;

    setProcessingAction(true);
    try {
      await handleDiscard(selectedTile);
      setSelectedTile(null); // Clear selection after discard
    } catch (err) {
      console.error('Discard failed:', err);
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
    setSelectedTile(selectedTile === tile ? null : tile);
  };

  // Handle declaring a self-draw win
  const onDeclareWin = async () => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleSelfDrawWin();
      if (!result.success) {
        console.error('Win declaration failed:', result.error);
      }
    } catch (err) {
      console.error('Win declaration failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle declaring a win on discard
  const onDeclareDiscardWin = async () => {
    if (processingAction) return;

    setProcessingAction(true);
    try {
      const result = await handleDiscardWin();
      if (!result.success) {
        console.error('Win declaration failed:', result.error);
      }
    } catch (err) {
      console.error('Win declaration failed:', err);
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
      if (!result.success) {
        console.error('Call response failed:', result.error);
      }
      // Reset chow selection state
      setChowSelectionMode(false);
      setSelectedChowTiles([]);
    } catch (err) {
      console.error('Call response failed:', err);
    } finally {
      setProcessingAction(false);
    }
  };

  // Phase 8: Enter chow selection mode
  const onChowClick = () => {
    setChowSelectionMode(true);
    setSelectedChowTiles([]);
  };

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
      if (!result.success) {
        console.error('Chow failed:', result.error);
      }
      setChowSelectionMode(false);
      setSelectedChowTiles([]);
    } catch (err) {
      console.error('Chow failed:', err);
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

  // Loading state
  if (authLoading || roomLoading || gameLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">Loading game...</div>
          <div className="text-green-400">Room: {roomCode}</div>
        </div>
      </div>
    );
  }

  // No game state
  if (!room || !gameState || mySeat === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
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
        <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">🤝 Draw Game</div>
            <div className="text-xl mb-4 text-green-300">Wall exhausted - no winner</div>
            <p className="text-green-400 mb-6">No payment this round.</p>
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

    // Winner exists
    const winner = gameState.winner;
    const winnerName =
      room.players[`seat${winner.seat}` as keyof typeof room.players]?.name || 'Unknown';
    const discarderName = winner.discarderSeat !== undefined
      ? room.players[`seat${winner.discarderSeat}` as keyof typeof room.players]?.name || 'Unknown'
      : null;

    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">
            {winner.isThreeGolds ? '🀄🀄🀄 THREE GOLDS!' : '🎉 Winner!'}
          </div>
          <div className="text-2xl mb-2">{winnerName}</div>
          <div className="text-sm text-green-300 mb-4">
            {winner.isThreeGolds
              ? 'Instant win with 3 Gold tiles!'
              : winner.isSelfDraw
                ? 'Won by self-draw'
                : `Won on ${discarderName}'s discard`}
          </div>

          {/* Show full winning hand */}
          {winner.hand && (
            <div className="mb-4">
              <div className="text-green-400 text-sm mb-2">Winning Hand:</div>

              {/* Gold tiles - prominently displayed at top */}
              {(() => {
                const goldTiles = winner.hand.filter((t: string) =>
                  gameState.goldTileType && getTileType(t) === gameState.goldTileType
                );
                if (goldTiles.length === 0) return null;
                return (
                  <div className="mb-3">
                    <div className="text-yellow-400 text-xs mb-1">Gold Tiles:</div>
                    <div className="flex flex-wrap justify-center gap-1">
                      {goldTiles.map((tileId: string, index: number) => {
                        const isWinningTile = tileId === winner.winningTile;
                        return (
                          <div key={`gold-${index}`} className="relative">
                            {isWinningTile && (
                              <div className="absolute -inset-1 bg-yellow-400 rounded animate-pulse" />
                            )}
                            <Tile
                              tileId={tileId}
                              goldTileType={gameState.goldTileType}
                              size="sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Concealed hand tiles (non-gold, with winning tile integrated and highlighted) */}
              <div className="mb-2">
                <div className="text-green-300 text-xs mb-1">Concealed:</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {(() => {
                    // Get non-gold tiles and sort them
                    const nonGoldTiles = winner.hand.filter((t: string) =>
                      !gameState.goldTileType || getTileType(t) !== gameState.goldTileType
                    );
                    const sortedTiles = sortTilesForDisplay(nonGoldTiles, gameState.goldTileType);

                    return sortedTiles.map((tileId: string, index: number) => {
                      const isWinningTile = tileId === winner.winningTile;
                      return (
                        <div key={`hand-${index}`} className="relative">
                          {isWinningTile && (
                            <div className="absolute -inset-1 bg-yellow-400 rounded animate-pulse" />
                          )}
                          <Tile
                            tileId={tileId}
                            goldTileType={gameState.goldTileType}
                            size="sm"
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Exposed melds (called from discard pile) */}
              {gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds]?.length > 0 && (
                <div className="mt-3">
                  <div className="text-green-300 text-xs mb-1">Called:</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {gameState.exposedMelds[`seat${winner.seat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                      <div key={`meld-${meldIndex}`} className="flex gap-0.5 bg-green-700/50 px-1 py-0.5 rounded">
                        {meld.tiles.map((tileId: string, tileIndex: number) => (
                          <Tile
                            key={`meld-${meldIndex}-${tileIndex}`}
                            tileId={tileId}
                            goldTileType={gameState.goldTileType}
                            size="sm"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Show viewing player's hand (only if they're not the winner) */}
          {mySeat !== null && mySeat !== winner.seat && myHand.length > 0 && (
            <div className="mb-4 mt-6 pt-4 border-t border-green-700">
              <div className="text-blue-400 text-sm mb-2">Your Hand:</div>

              {/* Concealed tiles */}
              <div className="mb-2">
                <div className="flex flex-wrap justify-center gap-1">
                  {sortTilesForDisplay(myHand, gameState.goldTileType).map((tileId: string, index: number) => (
                    <Tile
                      key={`my-hand-${index}`}
                      tileId={tileId}
                      goldTileType={gameState.goldTileType}
                      size="sm"
                    />
                  ))}
                </div>
              </div>

              {/* My exposed melds */}
              {gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds]?.length > 0 && (
                <div className="mt-2">
                  <div className="text-blue-300 text-xs mb-1">Called:</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {gameState.exposedMelds[`seat${mySeat}` as keyof typeof gameState.exposedMelds].map((meld, meldIndex) => (
                      <div key={`my-meld-${meldIndex}`} className="flex gap-0.5 bg-green-700/50 px-1 py-0.5 rounded">
                        {meld.tiles.map((tileId: string, tileIndex: number) => (
                          <Tile
                            key={`my-meld-${meldIndex}-${tileIndex}`}
                            tileId={tileId}
                            goldTileType={gameState.goldTileType}
                            size="sm"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-green-800/50 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold mb-2">Score Breakdown</h3>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Base:</span>
                <span>{winner.score.base}</span>
              </div>
              <div className="flex justify-between">
                <span>Bonus tiles:</span>
                <span>+{winner.score.bonusTiles}</span>
              </div>
              <div className="flex justify-between">
                <span>Gold tiles:</span>
                <span>+{winner.score.golds}</span>
              </div>
              <div className="flex justify-between border-t border-green-600 pt-1">
                <span>Subtotal:</span>
                <span>{winner.score.subtotal}</span>
              </div>
              {winner.isSelfDraw && (
                <div className="flex justify-between">
                  <span>Self-draw:</span>
                  <span>×{winner.score.multiplier}</span>
                </div>
              )}
              {winner.isThreeGolds && (
                <div className="flex justify-between text-yellow-400">
                  <span>Three Golds bonus:</span>
                  <span>+{winner.score.threeGoldsBonus}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-green-600 pt-1 font-bold text-lg">
                <span>Total:</span>
                <span>{winner.score.total}</span>
              </div>
            </div>
          </div>

          {/* Cumulative Scores Section */}
          {sessionScores && sessionScores.rounds && (
            <div className="bg-blue-800/50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold mb-2">
                Cumulative Scores (Round {sessionScores.rounds?.length || 1})
              </h3>
              {(() => {
                const netPositions = calculateNetPositions(sessionScores.rounds || []);
                // Calculate raw points won (just wins, no losses)
                const rawPoints: Record<string, number> = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
                for (const round of sessionScores.rounds || []) {
                  if (round.winnerSeat !== null && round.score > 0) {
                    rawPoints[`seat${round.winnerSeat}`] += round.score;
                  }
                }
                return (
                  <div className="text-sm">
                    {/* Header row */}
                    <div className="flex justify-between text-green-300 text-xs mb-1 border-b border-blue-700 pb-1">
                      <span>Player</span>
                      <div className="flex gap-4">
                        <span className="w-16 text-right">Won</span>
                        <span className="w-16 text-right">Net</span>
                      </div>
                    </div>
                    {/* Player rows */}
                    {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
                      const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                      const playerName = player?.name || `Player ${seat + 1}`;
                      const net = netPositions[`seat${seat}`] || 0;
                      const won = rawPoints[`seat${seat}`] || 0;
                      const isWinner = winner.seat === seat;
                      return (
                        <div
                          key={seat}
                          className={`flex justify-between py-0.5 ${isWinner ? 'text-yellow-400 font-semibold' : ''}`}
                        >
                          <span>{playerName} ({SEAT_LABELS[seat]}):</span>
                          <div className="flex gap-4">
                            <span className="w-16 text-right">{won}</span>
                            <span className={`w-16 text-right ${net < 0 ? 'text-red-400' : net > 0 ? 'text-green-400' : ''}`}>
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

          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-3 justify-center flex-wrap">
              {sessionScores && (
                <button
                  onClick={() => setShowSettleModal(true)}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg"
                >
                  Settle
                </button>
              )}
              {room?.hostId === user?.uid ? (
                <button
                  onClick={async () => {
                    // Rotate dealer to next seat
                    const nextDealer = ((gameState.dealerSeat + 1) % 4) as SeatIndex;
                    await startGame(nextDealer);
                  }}
                  className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg"
                >
                  Another Round
                </button>
              ) : (
                <button
                  disabled
                  className="px-6 py-3 bg-gray-500 text-gray-300 font-semibold rounded-lg cursor-not-allowed"
                >
                  Another Round
                </button>
              )}
            </div>
            {room?.hostId !== user?.uid && (
              <p className="text-sm text-gray-400">Waiting for host to start next round...</p>
            )}
          </div>

          {/* Settlement Modal */}
          {showSettleModal && sessionScores && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-green-900 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-green-700">
                <h3 className="text-xl font-bold mb-4 text-center">Settlement Summary</h3>
                <p className="text-green-300 text-sm mb-4 text-center">
                  To balance all scores:
                </p>
                {(() => {
                  const playerNames: Record<string, string> = {};
                  ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
                    const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
                    playerNames[`seat${seat}`] = player?.name || `Player ${seat + 1}`;
                  });
                  const { settlements, balances } = calculateSettlement(
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
                    className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-semibold text-sm"
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
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <span className="text-green-400">Room:</span>{' '}
          <span className="font-mono text-yellow-400">{roomCode}</span>
        </div>
        <div className="flex items-center gap-4">
          {gameState.goldTileType ? (
            <div className="flex items-center gap-2">
              <span className="text-green-400">Gold:</span>
              <Tile tileId={gameState.exposedGold} goldTileType={gameState.goldTileType} size="sm" />
            </div>
          ) : (
            <span className="text-green-400">Gold: Not revealed</span>
          )}
          <div>
            <span className="text-green-400">Wall:</span>{' '}
            <span>{gameState.wall.length}</span>
          </div>
        </div>
      </div>

      {/* Phase indicator */}
      <div className="text-center mb-4">
        {isBonusPhase ? (
          <div className="bg-blue-500/20 rounded-lg p-3">
            <div className="text-lg font-semibold text-blue-300">Bonus Tile Exposure</div>
            <div className="text-sm text-blue-200">
              {isMyTurn
                ? 'Your turn - Click to expose your bonus tiles'
                : `Waiting for ${SEAT_LABELS[gameState.currentPlayerSeat]} to expose bonus tiles...`}
            </div>
          </div>
        ) : isCallingPhase ? (
          <div className="bg-orange-500/20 rounded-lg p-3">
            <div className="text-lg font-semibold text-orange-300">Calling Phase</div>
            <div className="text-sm text-orange-200">
              {myPendingCall === 'discarder'
                ? 'Waiting for other players to respond...'
                : myPendingCall && typeof myPendingCall === 'string'
                  ? `You chose: ${myPendingCall.toUpperCase()} - Waiting for others...`
                  : chowSelectionMode
                    ? 'Select 2 tiles from your hand to form the chow'
                    : 'Choose: Win, Pung, Chow, or Pass'}
            </div>
          </div>
        ) : gameState.phase === 'playing' ? (
          <div className="bg-green-500/20 rounded-lg p-3">
            <div className="text-lg font-semibold text-green-300">
              {isMyTurn ? 'Your Turn' : `${SEAT_LABELS[gameState.currentPlayerSeat]}'s Turn`}
            </div>
            {isMyTurn && (
              <div className="text-sm text-green-200 mt-1">
                {shouldDraw
                  ? 'Click "Draw" to draw a tile from the wall'
                  : 'Select a tile to discard, then click "Discard"'}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Last action indicator */}
      {gameState.lastAction?.type === 'discard' && gameState.lastAction.tile && (
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 bg-red-500/20 rounded-lg px-4 py-2">
            <span className="text-red-300 text-sm">
              {SEAT_LABELS[gameState.lastAction.playerSeat]} discarded:
            </span>
            <Tile
              tileId={gameState.lastAction.tile}
              goldTileType={gameState.goldTileType}
              size="sm"
            />
          </div>
        </div>
      )}

      {/* Other players */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {([0, 1, 2, 3] as SeatIndex[])
          .filter((seat) => seat !== mySeat)
          .map((seat) => {
            const player = room.players[`seat${seat}` as keyof typeof room.players];
            if (!player) return null;

            // Calculate tile count: dealer starts with 17, others with 16
            // Each exposed meld removes 2 tiles from hand (you reveal 2 + take 1 discard)
            const isDealer = gameState.dealerSeat === seat;
            const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
            const baseTileCount = isDealer ? 17 : 16;
            const tileCount = baseTileCount - (2 * exposedMelds.length);

            return (
              <PlayerInfo
                key={seat}
                seat={seat}
                name={player.name}
                isDealer={isDealer}
                isCurrentTurn={gameState.currentPlayerSeat === seat}
                bonusTiles={gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || []}
                exposedMelds={exposedMelds}
                tileCount={tileCount}
                isSelf={false}
              />
            );
          })}
      </div>

      {/* Game Log */}
      {gameState.actionLog?.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-green-400 mb-2">Game Log ({gameState.actionLog.length} entries)</div>
          <div ref={logRef} className="bg-green-800/30 rounded-lg p-3 max-h-24 overflow-y-auto text-xs space-y-1">
            {(gameState.actionLog || []).map((entry, index, arr) => (
              <div key={index} className={index === arr.length - 1 ? 'text-white' : 'text-green-300/70'}>
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discard pile - consolidated with counts */}
      {gameState.discardPile?.length > 0 && (
        <div className="mb-6">
          <div className="text-sm text-green-400 mb-2">
            Discard Pile ({gameState.discardPile.length} tiles)
          </div>
          <div className="flex gap-2 flex-wrap bg-green-800/30 rounded-lg p-3">
            {(() => {
              // Group tiles by type and count them
              const tileCounts = new Map<string, { tileId: TileId; count: number; lastIndex: number }>();
              gameState.discardPile.forEach((tile, index) => {
                const tileType = getTileType(tile);
                const existing = tileCounts.get(tileType);
                if (existing) {
                  existing.count++;
                  existing.lastIndex = index;
                } else {
                  tileCounts.set(tileType, { tileId: tile, count: 1, lastIndex: index });
                }
              });

              const mostRecentIndex = gameState.discardPile.length - 1;
              const mostRecentType = getTileType(gameState.discardPile[mostRecentIndex]);

              // Sort by tile type for consistent display
              const sortedEntries = Array.from(tileCounts.entries()).sort((a, b) => {
                return a[0].localeCompare(b[0]);
              });

              return sortedEntries.map(([tileType, { tileId, count }]) => {
                const isMostRecent = tileType === mostRecentType;
                return (
                  <div
                    key={tileType}
                    className={`relative ${isMostRecent ? 'ring-2 ring-red-400 rounded-md' : ''}`}
                  >
                    <Tile
                      tileId={tileId}
                      goldTileType={gameState.goldTileType || ''}
                      size="sm"
                    />
                    {count > 1 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                        {count}
                      </span>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* My info */}
      <div className="mb-4">
        <PlayerInfo
          seat={mySeat}
          name={room.players[`seat${mySeat}` as keyof typeof room.players]?.name || 'You'}
          isDealer={gameState.dealerSeat === mySeat}
          isCurrentTurn={isMyTurn}
          bonusTiles={gameState.bonusTiles?.[`seat${mySeat}` as keyof typeof gameState.bonusTiles] || []}
          exposedMelds={gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || []}
          tileCount={myHand.length}
          isSelf={true}
        />
      </div>

      {/* My hand */}
      <div className="bg-green-800/50 rounded-lg p-4">
        <div className="text-sm text-green-400 mb-3">
          Your Hand ({myHand.length} tiles)
          {chowSelectionMode && (
            <span className="ml-2 text-cyan-400">
              - Select tiles for Chow ({selectedChowTiles.length}/2)
            </span>
          )}
        </div>
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
                  onClick={canClick ? () => onChowTileClick(tile) : undefined}
                  isChowValid={selectedChowTiles.length === 0 ? isValidFirst : isValidSecond}
                  isChowSelected={isSelected}
                  disabled={!canClick && !isSelected}
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
              gameState.lastAction?.type === 'draw' &&
              gameState.lastAction.playerSeat === mySeat
                ? gameState.lastAction.tile
                : null
            }
          />
        )}
      </div>

      {/* Bonus exposure button */}
      {isBonusPhase && isMyTurn && (
        <div className="mt-6 text-center">
          <button
            onClick={handleBonusExposure}
            disabled={processingBonus}
            className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-500 text-black font-bold text-lg rounded-lg"
          >
            {processingBonus ? 'Processing...' : 'Expose Bonus Tiles & Continue'}
          </button>
        </div>
      )}

      {/* Phase 8: Call buttons during calling phase */}
      {isCallingPhase && myPendingCall === null && !chowSelectionMode && (
        <div className="mt-6">
          {/* Pending calls status */}
          {gameState.pendingCalls && (
            <div className="text-center mb-4">
              <div className="inline-flex gap-4 text-sm bg-green-800/30 rounded-lg px-4 py-2">
                {([0, 1, 2, 3] as SeatIndex[]).map(seat => {
                  const call = gameState.pendingCalls![`seat${seat}` as keyof PendingCalls];
                  if (call === 'discarder') return null;
                  const playerName = room.players[`seat${seat}` as keyof typeof room.players]?.name || SEAT_LABELS[seat];
                  const isSelf = seat === mySeat;

                  return (
                    <div key={seat} className="flex items-center gap-1">
                      <span className={isSelf ? 'text-blue-400' : 'text-green-400'}>
                        {isSelf ? 'You' : playerName}:
                      </span>
                      <span className={call ? 'text-green-300' : 'text-yellow-400'}>
                        {call
                          ? (isSelf ? (call === 'pass' ? 'Passed' : call.toUpperCase()) : 'Ready')
                          : 'Thinking...'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Call action buttons */}
          <div className="text-center">
            <div className="flex flex-wrap justify-center gap-3">
              {/* Win button */}
              {myValidCalls?.canWin && (
                <button
                  onClick={() => onCallResponse('win')}
                  disabled={processingAction}
                  className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg"
                >
                  {processingAction ? 'Calling...' : 'WIN!'}
                </button>
              )}

              {/* Pung button */}
              {myValidCalls?.canPung && (
                <button
                  onClick={() => onCallResponse('pung')}
                  disabled={processingAction}
                  className="px-6 py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-500 text-white font-bold rounded-lg"
                >
                  {processingAction ? 'Calling...' : 'PUNG'}
                </button>
              )}

              {/* Chow button */}
              {myValidCalls?.canChow && (
                <button
                  onClick={onChowClick}
                  disabled={processingAction}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-500 text-white font-bold rounded-lg"
                >
                  CHOW
                </button>
              )}

              {/* Pass button - ALWAYS available */}
              <button
                onClick={() => onCallResponse('pass')}
                disabled={processingAction}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-bold rounded-lg"
              >
                {processingAction ? 'Passing...' : 'PASS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 8: Chow selection mode buttons */}
      {isCallingPhase && chowSelectionMode && (
        <div className="mt-6 text-center">
          <div className="flex justify-center gap-3">
            <button
              onClick={onConfirmChow}
              disabled={selectedChowTiles.length !== 2 || processingAction}
              className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:bg-gray-500 text-white font-bold rounded-lg"
            >
              {processingAction ? 'Confirming...' : `Confirm Chow (${selectedChowTiles.length}/2)`}
            </button>
            <button
              onClick={onCancelChow}
              disabled={processingAction}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-bold rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Phase 8: Waiting status when already responded */}
      {isCallingPhase && myPendingCall !== null && myPendingCall !== 'discarder' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 bg-green-800/30 rounded-lg px-6 py-3">
            <span className="text-green-400">You chose:</span>
            <span className="text-green-200 font-bold uppercase">{myPendingCall}</span>
            <span className="text-green-400 animate-pulse">- Waiting for others...</span>
          </div>
        </div>
      )}

      {/* Win on discard button (only during playing phase - calling phase has its own win button) */}
      {gameState.phase === 'playing' && canWinOnLastDiscard && (
        <div className="mt-6 text-center">
          <button
            onClick={onDeclareDiscardWin}
            disabled={processingAction}
            className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold text-lg rounded-lg animate-pulse shadow-lg"
          >
            {processingAction ? 'Declaring Win...' : '🎉 WIN! (Claim Discard)'}
          </button>
        </div>
      )}

      {/* Turn action buttons */}
      {gameState.phase === 'playing' && isMyTurn && (
        <div className="mt-6 text-center flex flex-col items-center gap-3">
          {/* Self-draw win button */}
          {canWinNow && (
            <button
              onClick={onDeclareWin}
              disabled={processingAction}
              className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold text-lg rounded-lg animate-pulse shadow-lg"
            >
              {processingAction ? 'Declaring Win...' : '🎉 WIN! (Self-Draw)'}
            </button>
          )}

          {/* Draw or discard buttons */}
          {shouldDraw ? (
            <button
              onClick={onDraw}
              disabled={processingAction}
              className="px-8 py-4 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-500 text-white font-bold text-lg rounded-lg"
            >
              {processingAction ? 'Drawing...' : 'Draw Tile'}
            </button>
          ) : (
            <button
              onClick={onDiscard}
              disabled={processingAction || !selectedTile}
              className="px-8 py-4 bg-red-500 hover:bg-red-400 disabled:bg-gray-500 text-white font-bold text-lg rounded-lg"
            >
              {processingAction ? 'Discarding...' : selectedTile ? 'Discard Selected Tile' : 'Select a Tile to Discard'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
