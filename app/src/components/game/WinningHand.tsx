'use client';

import { TileId, TileType, Meld } from '@/types';
import { Tile } from '@/components/tiles';
import { sortTilesForDisplay, isGoldTile } from '@/lib/tiles';

export interface WinningHandProps {
  hand: TileId[];
  goldTileType: TileType | null;
  exposedMelds?: Meld[];
  winningTile?: TileId;
  isThreeGolds?: boolean;
  compact?: boolean;
}

export function WinningHand({
  hand,
  goldTileType,
  exposedMelds = [],
  winningTile,
  isThreeGolds = false,
  compact = false,
}: WinningHandProps) {
  const sortedHand = sortTilesForDisplay(hand, goldTileType);
  const tileSize = compact ? 'sm' : 'md';

  return (
    <div>
      {/* Concealed tiles */}
      <div className={`flex flex-wrap ${compact ? 'gap-0.5' : 'gap-1'} mb-2`}>
        {sortedHand.map((tileId, index) => {
          // For Three Golds: highlight all gold tiles
          // For other wins: highlight only the winning tile
          const isGold = goldTileType && isGoldTile(tileId, goldTileType);
          const isHighlighted = isThreeGolds ? isGold : tileId === winningTile;

          return (
            <div
              key={`hand-${index}`}
              className={`relative ${
                isHighlighted
                  ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-700 rounded-md'
                  : ''
              }`}
            >
              <Tile tileId={tileId} goldTileType={goldTileType ?? undefined} size={tileSize} />
            </div>
          );
        })}
      </div>

      {/* Exposed melds */}
      {exposedMelds.length > 0 && (
        <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
          <span className={`text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>Called:</span>
          {exposedMelds.map((meld, meldIndex) => (
            <div
              key={`meld-${meldIndex}`}
              className={`flex gap-0.5 rounded p-0.5 ${
                meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'
              }`}
            >
              {meld.tiles.map((tileId, tileIndex) => (
                <Tile
                  key={`meld-${meldIndex}-${tileIndex}`}
                  tileId={tileId}
                  goldTileType={goldTileType ?? undefined}
                  size={tileSize}
                />
              ))}
              {meld.isConcealed && (
                <span className="text-pink-300 text-xs ml-1 self-center">C</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
