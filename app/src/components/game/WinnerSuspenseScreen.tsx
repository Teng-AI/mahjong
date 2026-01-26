'use client';

import { getTileType, getTileDisplayText, isGoldTile, sortTilesForDisplay } from '@/lib/tiles';
import { GameState, Meld } from '@/types';

export interface WinnerSuspenseScreenProps {
  gameState: GameState;
  suspensePhase: 'faceDown' | 'flipping' | 'flyIn' | 'fading';
}

export function WinnerSuspenseScreen({
  gameState,
  suspensePhase,
}: WinnerSuspenseScreenProps) {
  const winner = gameState.winner!;
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

  // Get suit-specific text color (matching gameplay)
  const getSuitColor = (tt: string) => {
    if (tt.startsWith('dots_')) return 'text-red-600';
    if (tt.startsWith('bamboo_')) return 'text-blue-600';
    if (tt.startsWith('characters_')) return 'text-green-600';
    return 'text-slate-800';
  };

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
          {winnerExposedMelds.map((meld: Meld, meldIdx: number) => {
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
