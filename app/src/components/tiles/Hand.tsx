'use client';

import { isGoldTile } from '@/lib/tiles';
import { TileId, TileType } from '@/types';
import { Tile } from './Tile';

export interface HandProps {
  tiles: TileId[];
  goldTileType?: TileType;
  onTileClick?: (tile: TileId) => void;
  selectedTile?: TileId | null;
  justDrawnTile?: TileId | null;
  size?: 'sm' | 'md' | 'lg';
}

export function Hand({
  tiles,
  goldTileType,
  onTileClick,
  selectedTile,
  justDrawnTile,
  size = 'lg',
}: HandProps) {
  return (
    <div className="flex gap-1 flex-wrap justify-center overflow-visible pt-2">
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
