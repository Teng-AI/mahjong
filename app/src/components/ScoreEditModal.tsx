'use client';

import { useState } from 'react';

interface PlayerScore {
  seatIndex: number;
  name: string;
  currentWon: number; // Cumulative "Won" score
}

interface ScoreEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: PlayerScore[];
  onSave: (adjustments: Record<number, number>) => Promise<void>;
}

// Calculate net scores from cumulative "won" scores
// Formula: net = won × 4 - totalWon (zero-sum across 4 players)
function calculateNetFromWon(wonScores: Record<number, number>): Record<number, number> {
  const totalWon = Object.values(wonScores).reduce((sum, v) => sum + v, 0);
  const net: Record<number, number> = {};
  for (const [seat, won] of Object.entries(wonScores)) {
    net[parseInt(seat)] = won * 4 - totalWon;
  }
  return net;
}

export function ScoreEditModal({ isOpen, onClose, players, onSave }: ScoreEditModalProps) {
  const [adjustments, setAdjustments] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdjustmentChange = (seatIndex: number, value: string) => {
    // Allow empty, negative sign, or numbers
    if (value === '' || value === '-' || /^-?\d*$/.test(value)) {
      setAdjustments(prev => ({ ...prev, [seatIndex]: value }));
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      // Convert string adjustments to numbers, filtering out empty/invalid
      const numericAdjustments: Record<number, number> = {};
      for (const [seat, value] of Object.entries(adjustments)) {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num !== 0) {
          numericAdjustments[parseInt(seat, 10)] = num;
        }
      }

      if (Object.keys(numericAdjustments).length === 0) {
        onClose();
        return;
      }

      await onSave(numericAdjustments);
      setAdjustments({});
      onClose();
    } catch (err) {
      setError('Failed to save score adjustments');
      console.error('Score edit error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setAdjustments({});
    setError(null);
    onClose();
  };

  // Calculate current and new won scores
  const currentWonScores: Record<number, number> = {};
  const newWonScores: Record<number, number> = {};

  for (const player of players) {
    currentWonScores[player.seatIndex] = player.currentWon;
    const adjustment = parseInt(adjustments[player.seatIndex] || '0', 10) || 0;
    newWonScores[player.seatIndex] = player.currentWon + adjustment;
  }

  // Calculate net scores
  const currentNet = calculateNetFromWon(currentWonScores);
  const newNet = calculateNetFromWon(newWonScores);

  // Check if any adjustments were made
  const hasAdjustments = Object.values(adjustments).some(v => {
    const num = parseInt(v, 10);
    return !isNaN(num) && num !== 0;
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div
        className="bg-slate-800 rounded-lg p-4 sm:p-6 max-w-lg w-full border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-amber-400 font-bold text-xl">Edit Scores</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          Adjust cumulative &quot;Won&quot; scores. Net scores update automatically.
        </p>

        {/* Header row */}
        <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm border-b border-slate-600 pb-2">
          <div className="flex-1">Player</div>
          <div className="w-16 text-center">Won</div>
          <div className="w-20 text-center">Adjust</div>
          <div className="w-16 text-center">Net</div>
        </div>

        <div className="space-y-2 mb-6">
          {players.map((player) => {
            const adjustment = adjustments[player.seatIndex] || '';
            const adjustmentNum = parseInt(adjustment, 10) || 0;
            const newWon = player.currentWon + adjustmentNum;
            const netChange = newNet[player.seatIndex] - currentNet[player.seatIndex];

            return (
              <div key={player.seatIndex} className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="text-white font-medium truncate">{player.name}</div>
                </div>

                {/* Current Won → New Won */}
                <div className="w-16 text-center">
                  {adjustmentNum !== 0 ? (
                    <div>
                      <span className="text-slate-500 line-through text-xs">{player.currentWon}</span>
                      <span className={`block ${adjustmentNum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {newWon}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-300">{player.currentWon}</span>
                  )}
                </div>

                {/* Adjustment input */}
                <div className="w-20">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={adjustment}
                    onChange={(e) => handleAdjustmentChange(player.seatIndex, e.target.value)}
                    placeholder="+/-"
                    className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-center text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Net score */}
                <div className="w-16 text-center">
                  {hasAdjustments ? (
                    <div>
                      <span className="text-slate-500 line-through text-xs">
                        {currentNet[player.seatIndex] >= 0 ? '+' : ''}{currentNet[player.seatIndex]}
                      </span>
                      <span className={`block ${newNet[player.seatIndex] >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {newNet[player.seatIndex] >= 0 ? '+' : ''}{newNet[player.seatIndex]}
                      </span>
                    </div>
                  ) : (
                    <span className={currentNet[player.seatIndex] >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {currentNet[player.seatIndex] >= 0 ? '+' : ''}{currentNet[player.seatIndex]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="text-red-400 text-sm mb-4">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-2 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white font-semibold rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
