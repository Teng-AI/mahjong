'use client';

export interface RoundEndActionsProps {
  /** Whether to show the Settle button */
  showSettle: boolean;
  /** Handler for Settle button click */
  onSettle: () => void;
  /** Current ready state of this player */
  isReady: boolean;
  /** Handler for toggling ready state */
  onToggleReady: () => void;
  /** Whether current player is host */
  isHost: boolean;
  /** Whether all players are ready */
  allReady: boolean;
  /** Handler for starting next round */
  onStartNextRound: () => void;
  /** Text for the Another Round button */
  anotherRoundText: string;
  /** Size variant - 'responsive' for winner page, 'large' for draw page */
  size?: 'responsive' | 'large';
}

/**
 * Action buttons shown at end of round (winner/draw screens).
 * Includes Settle, Ready toggle, and Another Round buttons.
 */
export function RoundEndActions({
  showSettle,
  onSettle,
  isReady,
  onToggleReady,
  isHost,
  allReady,
  onStartNextRound,
  anotherRoundText,
  size = 'responsive',
}: RoundEndActionsProps) {
  // Size-based classes
  const buttonSize = size === 'large'
    ? 'px-8 py-3 text-lg'
    : 'px-6 py-2 lg:px-8 lg:py-2.5 lg:text-lg';

  return (
    <>
      {/* Settle button */}
      {showSettle && (
        <button
          onClick={onSettle}
          className={`${buttonSize} bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg`}
        >
          Settle
        </button>
      )}

      {/* Ready toggle button - key forces full remount to prevent color bleeding */}
      {isReady ? (
        <button
          key="ready-done"
          onClick={onToggleReady}
          className={`${buttonSize} font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white`}
        >
          ✓ Ready
        </button>
      ) : (
        <button
          key="ready-waiting"
          onClick={onToggleReady}
          className={`${buttonSize} font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black animate-pulse shadow-lg shadow-amber-500/50`}
        >
          Ready Up!
        </button>
      )}

      {/* Host start button - only enabled when all ready */}
      {isHost && (
        <button
          onClick={onStartNextRound}
          disabled={!allReady}
          className={`${buttonSize} font-semibold rounded-lg ${
            allReady
              ? 'bg-amber-500 hover:bg-amber-400 text-black'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {anotherRoundText}
        </button>
      )}
    </>
  );
}
