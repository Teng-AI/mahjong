'use client';

import { useState, useMemo } from 'react';
import { Room, SessionScores } from '@/types';

export interface GameLogTabsProps {
  currentLog: string[];
  archivedLogs: Record<number, string[]>;
  sessionScores: SessionScores | null;
  room: Room | null;
  transformEntry: (entry: string) => string;
  compact?: boolean;
}

export function GameLogTabs({
  currentLog,
  archivedLogs,
  sessionScores,
  room,
  transformEntry,
  compact = false,
}: GameLogTabsProps) {
  const [logTab, setLogTab] = useState<'log' | 'summary'>('log');
  const [viewingRound, setViewingRound] = useState<number | null>(null);

  const totalRounds = sessionScores?.rounds?.length || 0;

  // Get displayed log based on which round we're viewing
  const displayedLog = useMemo(() => {
    if (viewingRound === null) {
      // Show current game log (chronological order)
      return currentLog;
    }
    // Show archived log for specific round
    return archivedLogs[viewingRound] || [];
  }, [viewingRound, currentLog, archivedLogs]);

  // Navigation helpers
  const canGoPrev = viewingRound === null ? totalRounds > 0 : viewingRound > 1;
  const canGoNext = viewingRound !== null && viewingRound < totalRounds;

  const goToPrevRound = () => {
    if (viewingRound === null && totalRounds > 0) {
      setViewingRound(totalRounds);
    } else if (viewingRound !== null && viewingRound > 1) {
      setViewingRound(viewingRound - 1);
    }
  };

  const goToNextRound = () => {
    if (viewingRound !== null) {
      if (viewingRound < totalRounds) {
        setViewingRound(viewingRound + 1);
      } else {
        setViewingRound(null); // Go to current
      }
    }
  };

  return (
    <div>
      {/* Tab buttons */}
      <div className={`flex gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <button
          onClick={() => setLogTab('log')}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            logTab === 'log'
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Game Log
        </button>
        <button
          onClick={() => setLogTab('summary')}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            logTab === 'summary'
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Session Summary
        </button>
      </div>

      {logTab === 'log' ? (
        <>
          {/* Pagination header */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={goToPrevRound}
              disabled={!canGoPrev}
              className={`px-2 py-1 text-sm rounded ${
                canGoPrev
                  ? 'text-slate-300 hover:bg-slate-600'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
            >
              ◀
            </button>
            <span className="text-sm text-slate-400">
              {viewingRound === null ? 'Current Game' : `Game ${viewingRound} of ${totalRounds}`}
            </span>
            <button
              onClick={goToNextRound}
              disabled={!canGoNext}
              className={`px-2 py-1 text-sm rounded ${
                canGoNext
                  ? 'text-slate-300 hover:bg-slate-600'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
            >
              ▶
            </button>
          </div>
          {/* Log entries */}
          <div className={`overflow-y-auto space-y-0.5 ${compact ? 'max-h-32' : 'max-h-40'}`}>
            {displayedLog.length > 0 ? (
              displayedLog.map((entry, index) => (
                <div key={index} className="text-xs py-0.5 text-slate-400">
                  {transformEntry(entry)}
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 italic">No log entries</div>
            )}
          </div>
        </>
      ) : (
        /* Session Summary */
        <div className={`overflow-y-auto space-y-1 ${compact ? 'max-h-32' : 'max-h-40'}`}>
          {sessionScores?.rounds && sessionScores.rounds.length > 0 ? (
            sessionScores.rounds.map((round) => {
              const winnerPlayer = round.winnerSeat !== null
                ? room?.players?.[`seat${round.winnerSeat}` as keyof typeof room.players]
                : null;
              const winnerName = winnerPlayer?.name || round.winnerName;

              // Determine win type from archived log
              const roundLog = archivedLogs[round.roundNumber] || [];
              const winEntry = roundLog.find(e => e.includes('wins'));
              let winType = '';
              if (round.winnerSeat === null) {
                winType = '';
              } else if (winEntry?.includes('Three Golds')) {
                winType = '(Three Golds!)';
              } else if (winEntry?.includes('Robbing')) {
                winType = '(Robbing Gold!)';
              } else if (winEntry?.includes('self-draw')) {
                winType = '(self-draw)';
              } else if (winEntry) {
                // Extract discarder name from "wins on X's discard"
                const match = winEntry.match(/on (\w+)'s discard/);
                winType = match ? `(on ${match[1]})` : '';
              }

              // Find adjustments made after this round
              const adjustmentEntries = roundLog.filter(e => e.includes('Host adjusted:'));

              return (
                <div key={round.roundNumber}>
                  <div className="text-xs text-slate-400">
                    {round.winnerSeat !== null ? (
                      <span>
                        {round.roundNumber}. {winnerName}{' '}
                        <span className="text-emerald-400">+{round.score}</span>{' '}
                        <span className="text-slate-500">{winType}</span>
                      </span>
                    ) : (
                      <span>{round.roundNumber}. Draw</span>
                    )}
                  </div>
                  {/* Show per-round adjustments */}
                  {adjustmentEntries.map((entry, idx) => (
                    <div key={idx} className="text-xs text-orange-400 pl-4">
                      {entry.replace('Host adjusted: ', '↳ Adj: ')}
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-500 italic">No completed rounds yet</div>
          )}
        </div>
      )}
    </div>
  );
}
