'use client';

import { SessionScoresTable } from './SessionScoresTable';
import { GameLogTabs } from './GameLogTabs';
import { RoundEndActions } from './RoundEndActions';
import { ScoreEditModal } from '@/components/ScoreEditModal';
import { calculateSettlement } from '@/lib/settle';
import { Room, SeatIndex, SessionScores, GameState } from '@/types';

export interface DrawGameScreenProps {
  room: Room | null;
  roomCode: string;
  gameState: GameState;
  sessionScores: SessionScores | null;
  gameLogs: Record<number, string[]>;
  currentLog: string[];
  isHost: boolean;
  readyCount: number;
  totalPlayers: number;
  allReady: boolean;
  myReadyState: boolean;
  showSettleModal: boolean;
  setShowSettleModal: (show: boolean) => void;
  showScoreEdit: boolean;
  setShowScoreEdit: (show: boolean) => void;
  transformLogEntry: (entry: string) => string;
  handleToggleReady: () => void;
  startGame: (dealerSeat: SeatIndex) => Promise<void>;
  adjustCumulativeScores: (roomCode: string, adjustments: Record<SeatIndex, number>) => Promise<void>;
}

export function DrawGameScreen({
  room,
  roomCode,
  gameState,
  sessionScores,
  gameLogs,
  currentLog,
  isHost,
  readyCount,
  totalPlayers,
  allReady,
  myReadyState,
  showSettleModal,
  setShowSettleModal,
  showScoreEdit,
  setShowScoreEdit,
  transformLogEntry,
  handleToggleReady,
  startGame,
  adjustCumulativeScores,
}: DrawGameScreenProps) {
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
            <SessionScoresTable
              room={room}
              sessionScores={sessionScores}
              showEditButton={isHost}
              onEditClick={() => setShowScoreEdit(true)}
            />
          </div>

          {/* Game Log / Session Summary Tabs */}
          <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
            <GameLogTabs
              currentLog={currentLog}
              archivedLogs={gameLogs}
              sessionScores={sessionScores}
              room={room}
              transformEntry={transformLogEntry}
            />
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
            <RoundEndActions
              showSettle={!!sessionScores}
              onSettle={() => setShowSettleModal(true)}
              isReady={myReadyState}
              onToggleReady={handleToggleReady}
              isHost={isHost}
              allReady={allReady}
              onStartNextRound={async () => {
                // On draw, dealer stays
                await startGame(gameState.dealerSeat);
              }}
              anotherRoundText="Another Round (Dealer Stays)"
              size="large"
            />
          </div>
        </div>

        {/* Settlement Modal */}
        {showSettleModal && sessionScores && (
          <SettlementModal
            room={room}
            sessionScores={sessionScores}
            onClose={() => setShowSettleModal(false)}
          />
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

// Settlement Modal extracted as internal component
interface SettlementModalProps {
  room: Room | null;
  sessionScores: SessionScores;
  onClose: () => void;
}

function SettlementModal({ room, sessionScores, onClose }: SettlementModalProps) {
  const playerNames: Record<string, string> = {};
  ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
    const player = room?.players?.[`seat${seat}` as keyof typeof room.players];
    playerNames[`seat${seat}`] = player?.name || `Player ${seat + 1}`;
  });
  const { settlements } = calculateSettlement(
    sessionScores.rounds || [],
    playerNames
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-slate-600">
        <h3 className="text-xl font-bold mb-4 text-center">Settlement Summary</h3>
        <p className="text-slate-300 text-lg mb-4 text-center">
          To balance all scores:
        </p>
        {settlements.length === 0 ? (
          <p className="text-center text-slate-400">All players are even!</p>
        ) : (
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
        )}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
