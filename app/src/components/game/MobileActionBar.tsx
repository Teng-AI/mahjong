'use client';

import { SeatIndex, TileId, TileType, Room, CallAction } from '@/types';

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;

type KongOption =
  | { type: 'concealed'; tileType: TileType }
  | { type: 'upgrade'; meldIndex: number; tileFromHand: TileId; tileType: TileType };

export interface MobileActionBarProps {
  // Phase states
  gamePhase: 'playing' | 'calling' | 'ended' | string;
  isCallingPhase: boolean;
  isMyTurn: boolean;
  shouldDraw: boolean;

  // Calling phase
  myPendingCall: string | null;
  hasRespondedToCalling: boolean;
  myValidCalls: { canChow?: boolean; canPung?: boolean; canKong?: boolean; canWin?: boolean } | null;
  pendingCalls: Record<string, string> | null;

  // Chow selection
  chowSelectionMode: boolean;
  selectedChowTiles: TileId[];

  // Kong selection
  kongSelectionMode: boolean;
  combinedKongOptions: KongOption[];
  focusedKongIndex: number;

  // Other states
  canWinNow: boolean;
  selectedTile: TileId | null;
  processingAction: boolean;
  currentPlayerSeat: SeatIndex;
  mySeat: SeatIndex;
  room: Room | null;

  // Callbacks
  onCallResponse: (action: CallAction) => void;
  onChowClick: () => void;
  onCancelChow: () => void;
  onConfirmChow: () => void;
  onDeclareWin: () => void;
  onKongKeyPress: () => void;
  onCancelKongSelection: () => void;
  executeKongOption: (option: KongOption) => void;
  onDraw: () => void;
  onDiscard: () => void;
  getPlayerName: (room: Room | null, seat: SeatIndex) => string;
}

export function MobileActionBar({
  gamePhase,
  isCallingPhase,
  isMyTurn,
  shouldDraw,
  myPendingCall,
  hasRespondedToCalling,
  myValidCalls,
  pendingCalls,
  chowSelectionMode,
  selectedChowTiles,
  kongSelectionMode,
  combinedKongOptions,
  focusedKongIndex,
  canWinNow,
  selectedTile,
  processingAction,
  currentPlayerSeat,
  mySeat,
  room,
  onCallResponse,
  onChowClick,
  onCancelChow,
  onConfirmChow,
  onDeclareWin,
  onKongKeyPress,
  onCancelKongSelection,
  executeKongOption,
  onDraw,
  onDiscard,
  getPlayerName,
}: MobileActionBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-40">
      <div className="flex gap-2">
        {/* Calling phase buttons - ordered left-to-right: PASS (lowest) to HU (highest priority) */}
        {isCallingPhase && myPendingCall === 'waiting' && !chowSelectionMode && (
          <>
            <button
              onClick={() => onCallResponse('pass')}
              disabled={processingAction}
              className="flex-1 py-3 bg-white hover:bg-gray-100 disabled:bg-gray-500 text-slate-800 disabled:text-white font-bold rounded-lg text-sm"
            >
              PASS
            </button>
            {myValidCalls?.canChow && (
              <button
                onClick={onChowClick}
                disabled={processingAction}
                className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                CHI
              </button>
            )}
            {myValidCalls?.canPung && (
              <button
                onClick={() => onCallResponse('pung')}
                disabled={processingAction}
                className="flex-1 py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                PENG
              </button>
            )}
            {myValidCalls?.canKong && (
              <button
                onClick={() => onCallResponse('kong')}
                disabled={processingAction}
                className="flex-1 py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                GANG
              </button>
            )}
            {myValidCalls?.canWin && (
              <button
                onClick={() => onCallResponse('win')}
                disabled={processingAction}
                className="flex-1 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm"
              >
                HU!
              </button>
            )}
          </>
        )}

        {/* Chow selection mode - Cancel (left) to Confirm (right) */}
        {isCallingPhase && chowSelectionMode && (
          <>
            <button
              onClick={onCancelChow}
              disabled={processingAction}
              className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmChow}
              disabled={selectedChowTiles.length !== 2 || processingAction}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
            >
              Confirm ({selectedChowTiles.length}/2)
            </button>
          </>
        )}

        {/* Waiting for call result - show all players' status (only after making choice) */}
        {isCallingPhase && hasRespondedToCalling && !chowSelectionMode && pendingCalls && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
            {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
              const call = pendingCalls[`seat${seat}`];
              const playerName = room?.players[`seat${seat}` as keyof typeof room.players]?.name || SEAT_LABELS[seat];
              const isMe = seat === mySeat;
              const isDiscarder = call === 'discarder';
              const isWaiting = !call;
              const hasResponded = !!call && call !== 'discarder';

              // Truncate name for mobile
              const displayName = playerName.length > 6 ? playerName.slice(0, 5) + '…' : playerName;

              return (
                <div
                  key={seat}
                  className={`px-2 py-1.5 rounded text-xs font-medium ${
                    isMe
                      ? 'bg-blue-500/40 text-blue-200 ring-1 ring-blue-400/50'
                      : isDiscarder
                      ? 'bg-slate-600/50 text-slate-400'
                      : hasResponded
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : isWaiting
                      ? 'bg-orange-500/30 text-orange-300 animate-pulse'
                      : 'bg-slate-600/50 text-slate-400'
                  }`}
                >
                  {displayName}
                  {isDiscarder && <span className="ml-0.5 opacity-60">—</span>}
                  {hasResponded && <span className="ml-0.5">✓</span>}
                  {isWaiting && <span className="ml-0.5">…</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Playing phase - my turn */}
        {gamePhase === 'playing' && isMyTurn && (
          <>
            {/* Self-draw hu button */}
            {!shouldDraw && canWinNow && (
              <button
                onClick={onDeclareWin}
                disabled={processingAction}
                className="flex-1 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:bg-gray-500 text-black font-bold rounded-lg animate-pulse shadow-lg text-sm"
              >
                HU!
              </button>
            )}

            {/* Gang button - unified */}
            {!shouldDraw && !kongSelectionMode && combinedKongOptions.length > 0 && (
              <button
                onClick={onKongKeyPress}
                disabled={processingAction}
                className="flex-1 py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                GANG
              </button>
            )}
            {/* Gang selection mode */}
            {!shouldDraw && kongSelectionMode && (
              <>
                <button
                  onClick={onCancelKongSelection}
                  disabled={processingAction}
                  className="py-3 px-4 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeKongOption(combinedKongOptions[focusedKongIndex])}
                  disabled={processingAction}
                  className="flex-1 py-3 bg-pink-500 hover:bg-pink-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
                >
                  Confirm Gang ({focusedKongIndex + 1}/{combinedKongOptions.length})
                </button>
              </>
            )}

            {/* Draw button */}
            {shouldDraw && (
              <button
                onClick={onDraw}
                disabled={processingAction}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                {processingAction ? 'Drawing...' : 'Draw'}
              </button>
            )}

            {/* Discard button */}
            {!shouldDraw && !kongSelectionMode && (
              <button
                onClick={onDiscard}
                disabled={processingAction || !selectedTile}
                className="flex-1 py-3 bg-red-500 hover:bg-red-400 disabled:bg-gray-500 text-white font-bold rounded-lg text-sm"
              >
                {selectedTile ? 'Discard' : 'Select tile'}
              </button>
            )}
          </>
        )}

        {/* Not my turn - waiting */}
        {gamePhase === 'playing' && !isMyTurn && !isCallingPhase && (
          <div className="px-4 py-2.5 text-slate-400 text-sm">
            {getPlayerName(room, currentPlayerSeat)}&apos;s turn...
          </div>
        )}
      </div>
    </div>
  );
}
