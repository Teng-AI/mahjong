'use client';

import { Tile } from '@/components/tiles';
import { SeatIndex, TileType, Room, Meld } from '@/types';

export interface PlayersGridProps {
  mySeat: SeatIndex;
  room: Room;
  dealerSeat: SeatIndex;
  currentPlayerSeat: SeatIndex;
  exposedMelds: Record<string, Meld[]>;
  bonusTiles: Record<string, string[]>;
  goldTileType?: TileType;
  needsDiscard: (seat: SeatIndex) => boolean;
}

export function PlayersGrid({
  mySeat,
  room,
  dealerSeat,
  currentPlayerSeat,
  exposedMelds,
  bonusTiles,
  goldTileType,
  needsDiscard,
}: PlayersGridProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
      <div className="grid grid-cols-[0.33fr_1fr_1fr_1fr] gap-1 sm:gap-2">
        {/* Order: current player first, then next 3 in turn order */}
        {[0, 1, 2, 3].map((offset) => {
          const seat = ((mySeat + offset) % 4) as SeatIndex;
          const player = room.players[`seat${seat}` as keyof typeof room.players];
          if (!player) return null;

          const isMe = seat === mySeat;
          const isDealer = dealerSeat === seat;
          const seatMelds = exposedMelds[`seat${seat}`] || [];
          const seatBonusTiles = bonusTiles[`seat${seat}`] || [];
          const isCurrentTurn = currentPlayerSeat === seat;
          // Total tiles = 16 base + 1 per kong (replacement draw) + 1 if needs to discard
          const kongCount = seatMelds.filter(m => m.type === 'kong').length;
          const needsDiscardNow = needsDiscard(seat);
          const totalTiles = 16 + kongCount + (needsDiscardNow ? 1 : 0);
          const tilesInMelds = seatMelds.reduce((sum, meld) => sum + meld.tiles.length, 0);
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
                  {seatBonusTiles.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-400 font-bold">+{seatBonusTiles.length}</span>
                    </>
                  )}
                </div>
              </div>
              {/* Melds */}
              {seatMelds.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 mt-1">
                  {seatMelds.map((meld, meldIdx) => (
                    <div key={meldIdx} className={`flex items-center gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-blue-900/50' : 'bg-slate-800/70'}`}>
                      {meld.tiles.length === 4 ? (
                        <>
                          <Tile tileId={meld.tiles[0]} goldTileType={goldTileType} size="sm" faceDown={meld.isConcealed} />
                          <span className="bg-amber-500 text-black text-[10px] px-1 py-0.5 rounded font-bold">×4</span>
                        </>
                      ) : (
                        meld.tiles.map((tile, i) => (
                          <Tile key={i} tileId={tile} goldTileType={goldTileType} size="sm" faceDown={meld.isConcealed} />
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
  );
}
