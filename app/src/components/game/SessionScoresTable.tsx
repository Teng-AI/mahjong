'use client';

import { Room, SeatIndex, SessionScores } from '@/types';

export interface SessionScoresTableProps {
  room: Room | null;
  sessionScores: SessionScores | null;
  highlightSeat?: SeatIndex | null;
  showEditButton?: boolean;
  onEditClick?: () => void;
  compact?: boolean;
}

export function SessionScoresTable({
  room,
  sessionScores,
  highlightSeat,
  showEditButton = false,
  onEditClick,
  compact = false,
}: SessionScoresTableProps) {
  if (!sessionScores?.rounds) {
    return <p className="text-slate-400">No session data</p>;
  }

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
    <div className={compact ? 'text-sm' : 'text-base'}>
      {/* Header row */}
      <div className={`flex items-center justify-between mb-2 ${compact ? 'mb-1' : 'mb-2'}`}>
        <h3 className={`font-semibold text-blue-400 ${compact ? 'text-sm' : 'text-lg'}`}>
          Session Scores {sessionScores.rounds ? `(Round ${sessionScores.rounds.length})` : ''}
        </h3>
        {showEditButton && onEditClick && (
          <button
            onClick={onEditClick}
            className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className={`flex justify-between text-slate-400 border-b border-slate-600 pb-1 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`}>
        <span>Player</span>
        <div className={`flex ${compact ? 'gap-4' : 'gap-6'}`}>
          <span className="w-12 text-right">Won</span>
          <span className="w-12 text-right">Net</span>
        </div>
      </div>

      {/* Player rows */}
      {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
        const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
        const playerName = player?.name || `Player ${seat + 1}`;
        const isBot = player?.isBot;
        const won = wonScores[`seat${seat}`];
        const net = netScores[`seat${seat}`];
        const isHighlighted = highlightSeat === seat;

        return (
          <div
            key={seat}
            className={`flex justify-between py-1 ${
              isHighlighted ? 'text-amber-400 font-semibold' : 'text-slate-200'
            }`}
          >
            <span className="truncate">{isBot ? '🤖 ' : ''}{playerName}</span>
            <div className={`flex ${compact ? 'gap-4' : 'gap-6'}`}>
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
}
