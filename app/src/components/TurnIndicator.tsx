'use client';

import { SeatIndex } from '@/types';

interface TurnIndicatorProps {
  currentActor: SeatIndex | null;  // Who is currently acting (green)
  previousActor: SeatIndex | null; // Who acted before them (grey)
  mySeat: SeatIndex;
}

/**
 * Shows a round table view with compass directions
 * Player is always at South, order is counter-clockwise: S → E → N → W
 */
export function TurnIndicator({ currentActor, previousActor, mySeat }: TurnIndicatorProps) {
  // Map absolute seats to relative positions (player always South)
  // Counter-clockwise from player: S(0) → E(+1) → N(+2) → W(+3)
  const getRelativePosition = (seat: SeatIndex): 'S' | 'E' | 'N' | 'W' => {
    const offset = (seat - mySeat + 4) % 4;
    return (['S', 'E', 'N', 'W'] as const)[offset];
  };

  const currentPosition = currentActor !== null ? getRelativePosition(currentActor) : null;
  const previousPosition = previousActor !== null ? getRelativePosition(previousActor) : null;

  // Base style for all labels - consistent sizing with transparent border
  const baseStyle = 'px-2 py-0.5 rounded border-2';

  const getStyle = (position: 'S' | 'E' | 'N' | 'W') => {
    if (currentPosition === position) {
      // Current actor - green box
      return `${baseStyle} text-white font-bold bg-emerald-500/30 border-emerald-400`;
    }
    if (previousPosition === position) {
      // Previous actor - grey box
      return `${baseStyle} text-slate-400 bg-slate-700/50 border-slate-600`;
    }
    // Waiting - dim with transparent border to maintain spacing
    return `${baseStyle} text-slate-500 border-transparent`;
  };

  return (
    <div className="rounded-xl p-2 sm:p-4 border bg-slate-800/50 border-slate-600 flex flex-col items-center justify-center">
      {/* Desktop layout */}
      <div className="hidden sm:grid grid-rows-3 gap-0 text-center text-sm place-items-center">
        {/* North */}
        <div className={`${getStyle('N')}`}>North</div>

        {/* West - East */}
        <div className="flex items-center justify-center gap-8">
          <span className={`${getStyle('W')}`}>West</span>
          <span className={`${getStyle('E')}`}>East</span>
        </div>

        {/* South + You */}
        <div className="flex flex-col items-center">
          <div className={`${getStyle('S')}`}>South</div>
          <div className="text-slate-500 text-xs mt-1">(You)</div>
        </div>
      </div>

      {/* Mobile layout - compact */}
      <div className="sm:hidden grid grid-rows-3 gap-0 text-center text-xs place-items-center">
        {/* North */}
        <div className={`${getStyle('N')}`}>N</div>

        {/* West - East */}
        <div className="flex items-center justify-center gap-5">
          <span className={`${getStyle('W')}`}>W</span>
          <span className={`${getStyle('E')}`}>E</span>
        </div>

        {/* South + You */}
        <div className="flex flex-col items-center">
          <div className={`${getStyle('S')}`}>S</div>
          <div className="text-slate-500 text-[10px]">(you)</div>
        </div>
      </div>
    </div>
  );
}
