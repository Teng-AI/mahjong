'use client';

import { Tile } from '@/components/tiles';
import { TileId, TileType } from '@/types';
import { getTileType } from '@/lib/tiles';

export interface DiscardPileProps {
  discardPile: TileId[];
  goldTileType?: TileType;
}

export function DiscardPile({ discardPile, goldTileType }: DiscardPileProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
      <div className="text-sm sm:text-lg text-slate-300 font-medium mb-2 sm:mb-3 flex items-center justify-between">
        <span>Discard Pile</span>
        <span className="text-slate-400 text-xs sm:text-base">{discardPile.length} tiles</span>
      </div>
      {discardPile.length > 0 ? (
        <div className="flex gap-1 sm:gap-1.5 flex-wrap">
          {(() => {
            const tileCounts = new Map<string, { tileId: TileId; count: number }>();
            discardPile.forEach((tile) => {
              const tileType = getTileType(tile);
              const existing = tileCounts.get(tileType);
              if (existing) existing.count++;
              else tileCounts.set(tileType, { tileId: tile, count: 1 });
            });
            return Array.from(tileCounts.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([tileType, { tileId, count }]) => (
                <div key={tileType} className="relative">
                  <Tile tileId={tileId} goldTileType={goldTileType} size="sm" />
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
  );
}
