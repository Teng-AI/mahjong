'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { useGame } from '@/hooks/useGame';
import { getTileType, getTileDisplayText, isBonusTile } from '@/lib/tiles';
import { SeatIndex, TileId, TileType, Meld } from '@/types';

// ============================================
// TILE COMPONENT
// ============================================

interface TileProps {
  tileId: TileId;
  goldTileType?: TileType;
  onClick?: () => void;
  selected?: boolean;
  isJustDrawn?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function Tile({ tileId, goldTileType, onClick, selected, isJustDrawn, size = 'md' }: TileProps) {
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
      disabled={!onClick}
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
        ${onClick ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}
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
      {tiles.map((tile, index) => (
        <Tile
          key={`${tile}-${index}`}
          tileId={tile}
          goldTileType={goldTileType}
          onClick={onTileClick ? () => onTileClick(tile) : undefined}
          selected={selectedTile === tile}
          isJustDrawn={justDrawnTile === tile}
        />
      ))}
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
  const roomCode = (params.code as string).toUpperCase();

  const { user, loading: authLoading } = useAuth();
  const {
    room,
    loading: roomLoading,
    mySeat,
  } = useRoom({
    roomCode,
    userId: user?.uid || null,
  });

  const {
    gameState,
    myHand,
    loading: gameLoading,
    processBonusExposure,
    shouldDraw,
    handleDraw,
    handleDiscard,
  } = useGame({
    roomCode,
    mySeat,
  });

  const [processingBonus, setProcessingBonus] = useState(false);
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

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
  const onTileClick = (tile: TileId) => {
    if (!isMyTurn || shouldDraw || gameState?.phase !== 'playing') return;
    setSelectedTile(selectedTile === tile ? null : tile);
  };

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

    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">
            {winner.isThreeGolds ? '🀄🀄🀄 THREE GOLDS!' : '🎉 Winner!'}
          </div>
          <div className="text-2xl mb-4">{winnerName}</div>

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

            return (
              <PlayerInfo
                key={seat}
                seat={seat}
                name={player.name}
                isDealer={gameState.dealerSeat === seat}
                isCurrentTurn={gameState.currentPlayerSeat === seat}
                bonusTiles={gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || []}
                exposedMelds={gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || []}
                tileCount={16} // We don't know their actual count
                isSelf={false}
              />
            );
          })}
      </div>

      {/* Game Log */}
      {gameState.actionLog?.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-green-400 mb-2">Game Log ({gameState.actionLog.length} entries)</div>
          <div className="bg-green-800/30 rounded-lg p-3 max-h-24 overflow-y-auto text-xs space-y-1">
            {[...(gameState.actionLog || [])].reverse().map((entry, index) => (
              <div key={index} className={index === 0 ? 'text-white' : 'text-green-300/70'}>
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
        <div className="text-sm text-green-400 mb-3">Your Hand ({myHand.length} tiles)</div>
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

      {/* Turn action buttons */}
      {gameState.phase === 'playing' && isMyTurn && (
        <div className="mt-6 text-center">
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
