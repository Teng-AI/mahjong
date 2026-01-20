'use client';

import { SeatIndex, Room } from '@/types';

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;

export interface CallingStatusBarProps {
  pendingCalls: Record<string, string>;
  room: Room;
}

export function CallingStatusBar({ pendingCalls, room }: CallingStatusBarProps) {
  return (
    <div className="hidden md:flex bg-slate-700/40 rounded-lg px-3 py-2 mt-2 items-center justify-center gap-2 sm:gap-3 text-sm flex-wrap">
      {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
        const call = pendingCalls[`seat${seat}`];
        const playerName = room.players[`seat${seat}` as keyof typeof room.players]?.name || SEAT_LABELS[seat];
        const isDiscarder = call === 'discarder';
        // Firebase doesn't store null, so undefined means waiting
        const isWaiting = !call;
        const hasResponded = !!call && call !== 'discarder';

        return (
          <div
            key={seat}
            className={`px-2 py-1 rounded ${
              isDiscarder
                ? 'bg-slate-600/50 text-slate-400'
                : hasResponded
                ? 'bg-emerald-500/30 text-emerald-300'
                : isWaiting
                ? 'bg-orange-500/30 text-orange-300 animate-pulse'
                : 'bg-slate-600/50 text-slate-400'
            }`}
          >
            {playerName}
            {isDiscarder && <span className="ml-1 text-xs opacity-60">—</span>}
            {hasResponded && <span className="ml-1">✓</span>}
            {isWaiting && <span className="ml-1">...</span>}
          </div>
        );
      })}
    </div>
  );
}
