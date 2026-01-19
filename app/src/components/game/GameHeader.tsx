'use client';

import { Tile } from '@/components/tiles';
import { TileId, TileType, SeatIndex, Room } from '@/types';

export interface GameHeaderProps {
  roomCode: string;
  goldTileType?: TileType;
  exposedGold?: TileId;
  wallCount: number;
  currentPlayerSeat: SeatIndex;
  isCallingPhase: boolean;
  isMyTurn: boolean;
  shouldDraw: boolean;
  chowSelectionMode: boolean;
  room: Room | null;
  timerRemainingSeconds: number | null;
  timerIsWarning: boolean;
  turnTimerRemainingSeconds: number | null;
  turnTimerIsWarning: boolean;
  onSettingsClick: () => void;
  onRulesClick: () => void;
  getPlayerName: (room: Room | null, seat: SeatIndex) => string;
}

export function GameHeader({
  roomCode,
  goldTileType,
  exposedGold,
  wallCount,
  currentPlayerSeat,
  isCallingPhase,
  isMyTurn,
  shouldDraw,
  chowSelectionMode,
  room,
  timerRemainingSeconds,
  timerIsWarning,
  turnTimerRemainingSeconds,
  turnTimerIsWarning,
  onSettingsClick,
  onRulesClick,
  getPlayerName,
}: GameHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-0.5 sm:gap-2 mb-1.5 sm:mb-3 bg-slate-700/40 rounded-lg px-1 sm:px-3 py-1 sm:py-2">
      <div className="flex items-center gap-1 sm:gap-4 flex-wrap">
        {/* Settings button */}
        <button
          onClick={onSettingsClick}
          className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white flex items-center justify-center"
          title="Settings"
        >
          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        {/* Rules button */}
        <button
          onClick={onRulesClick}
          className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white text-xs sm:text-lg font-bold flex items-center justify-center"
        >
          ?
        </button>
        <div className="flex items-center gap-0.5 sm:gap-2">
          <span className="text-slate-400 text-xs sm:text-lg">Room</span>
          <span className="font-mono text-amber-400 font-bold text-xs sm:text-base">{roomCode}</span>
        </div>
        {goldTileType && exposedGold && (
          <div className="flex items-center gap-0.5">
            <span className="text-slate-400 text-xs sm:text-lg hidden sm:inline">Gold</span>
            <Tile tileId={exposedGold} goldTileType={goldTileType} size="sm" />
          </div>
        )}
        <div className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-md transition-colors ${
          wallCount <= 4 ? 'bg-red-500/30 animate-pulse' :
          wallCount < 10 ? 'bg-yellow-500/20' : ''
        }`}>
          <span className={`text-xs sm:text-lg ${
            wallCount <= 4 ? 'text-red-400 font-semibold' :
            wallCount < 10 ? 'text-yellow-400' : 'text-slate-400'
          }`}>Wall</span>
          <span className={`font-mono text-xs sm:text-base ${
            wallCount <= 4 ? 'text-red-300 font-bold' :
            wallCount < 10 ? 'text-yellow-300 font-semibold' : 'text-white'
          }`}>{wallCount}</span>
          {wallCount <= 4 && (
            <span className="text-red-300 text-xs ml-1 hidden sm:inline">(No calls)</span>
          )}
        </div>
      </div>
      {/* Phase indicator with timer - right side */}
      <div className="flex items-center gap-1 sm:gap-2">
        <div className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-md text-xs sm:text-lg font-medium ${
          isCallingPhase ? 'bg-orange-500/40 text-orange-200' :
          isMyTurn ? 'bg-emerald-500/40 text-emerald-200' : 'bg-slate-600/60 text-slate-300'
        }`}>
          {isCallingPhase ? (chowSelectionMode ? 'Select Chi' : 'Calling...') :
           isMyTurn ? (shouldDraw ? '▶ Draw' : '▶ Discard') :
           `${getPlayerName(room, currentPlayerSeat)}'s turn`}
        </div>
        {/* Timer countdown (only during calling phase with timer enabled) */}
        {isCallingPhase && timerRemainingSeconds !== null && (
          <div className={`px-2 py-0.5 sm:py-1 rounded-md text-xs sm:text-lg font-mono font-bold ${
            timerIsWarning
              ? 'bg-red-500/60 text-red-100 animate-pulse'
              : 'bg-slate-600/60 text-slate-200'
          }`}>
            {Math.ceil(timerRemainingSeconds)}s
          </div>
        )}
        {/* Turn timer countdown (only during playing phase when it's my turn with timer enabled) */}
        {isMyTurn && turnTimerRemainingSeconds !== null && (
          <div className={`px-2 py-0.5 sm:py-1 rounded-md text-xs sm:text-lg font-mono font-bold ${
            turnTimerIsWarning
              ? 'bg-red-500/60 text-red-100 animate-pulse'
              : 'bg-emerald-500/40 text-emerald-200'
          }`}>
            {Math.ceil(turnTimerRemainingSeconds)}s
          </div>
        )}
      </div>
    </div>
  );
}
