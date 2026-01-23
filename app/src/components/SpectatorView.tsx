'use client';

import { useState, useEffect } from 'react';
import { Room, GameState, SeatIndex, SessionScores, ConnectionStatus } from '@/types';
import { needsToDraw } from '@/lib/game';
import {
  GameHeader,
  DiscardPile,
  SessionScoresTable,
  ScoreBreakdown,
  WinningHand,
  GameLogTabs,
} from '@/components/game';
import { Tile } from '@/components/tiles';
import { TurnIndicator } from '@/components/TurnIndicator';
import { ConnectionBanner } from '@/components/ConnectionBanner';

interface SpectatorViewProps {
  roomCode: string;
  room: Room;
  gameState: GameState;
  sessionScores: SessionScores | null;
  connectionStatus: ConnectionStatus;
  disconnectedAt: number | null;
  onRetry: () => void;
}

// Helper to get player name by seat
function getPlayerName(room: Room | null, seat: SeatIndex): string {
  const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;
  return room?.players?.[`seat${seat}` as keyof Room['players']]?.name || SEAT_LABELS[seat];
}

// Helper to transform log entry for spectators (hide private info)
function transformLogEntry(entry: string, room: Room | null): string {
  if (!room) return entry;

  let transformed = entry;

  // Hide all private information from spectators
  transformed = transformed.replace(/ \[PRIVATE:\d:[^\]]+\]/g, '');

  // Replace direction names with player names
  const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;
  SEAT_LABELS.forEach((direction, index) => {
    const playerName = getPlayerName(room, index as SeatIndex);
    const regex = new RegExp(`\\b${direction}\\b`, 'g');
    transformed = transformed.replace(regex, playerName);
  });

  return transformed;
}

export function SpectatorView({
  roomCode,
  room,
  gameState,
  sessionScores,
  connectionStatus,
  disconnectedAt,
  onRetry,
}: SpectatorViewProps) {
  const actionLog = gameState.actionLog || [];

  // Timer state for spectators (display only, no expiration callbacks)
  const [callingTimerRemaining, setCallingTimerRemaining] = useState<number | null>(null);
  const [turnTimerRemaining, setTurnTimerRemaining] = useState<number | null>(null);

  // Calculate timers for display
  useEffect(() => {
    const isCallingPhase = gameState.phase === 'calling';
    const isPlayingPhase = gameState.phase === 'playing';
    const callingTimerSeconds = gameState.callingTimerSeconds;
    const callingPhaseStartTime = gameState.callingPhaseStartTime;
    const turnTimerSeconds = gameState.turnTimerSeconds;
    const turnStartTime = gameState.turnStartTime;

    // No timers configured
    if (!callingTimerSeconds && !turnTimerSeconds) {
      setCallingTimerRemaining(null);
      setTurnTimerRemaining(null);
      return;
    }

    const updateTimers = () => {
      const currentTime = Date.now();

      // Calling phase timer
      if (isCallingPhase && callingTimerSeconds && callingPhaseStartTime) {
        const elapsed = (currentTime - callingPhaseStartTime) / 1000;
        const remaining = Math.max(0, callingTimerSeconds - elapsed);
        setCallingTimerRemaining(remaining);
      } else {
        setCallingTimerRemaining(null);
      }

      // Turn timer
      if (isPlayingPhase && turnTimerSeconds && turnStartTime) {
        const elapsed = (currentTime - turnStartTime) / 1000;
        const remaining = Math.max(0, turnTimerSeconds - elapsed);
        setTurnTimerRemaining(remaining);
      } else {
        setTurnTimerRemaining(null);
      }
    };

    // Initial calculation
    updateTimers();

    // Update every 100ms for smooth countdown
    const intervalId = setInterval(updateTimers, 100);

    return () => clearInterval(intervalId);
  }, [
    gameState.phase,
    gameState.callingTimerSeconds,
    gameState.callingPhaseStartTime,
    gameState.turnTimerSeconds,
    gameState.turnStartTime,
  ]);

  // Timer warning thresholds
  const CALLING_WARNING_THRESHOLD = 5;
  const TURN_WARNING_THRESHOLD = 10;
  const callingTimerIsWarning = callingTimerRemaining !== null && callingTimerRemaining <= CALLING_WARNING_THRESHOLD && callingTimerRemaining > 0;
  const turnTimerIsWarning = turnTimerRemaining !== null && turnTimerRemaining <= TURN_WARNING_THRESHOLD && turnTimerRemaining > 0;

  // Game ended - show winner or draw
  if (gameState.phase === 'ended') {
    const winner = gameState.winner;
    const winnerName = winner ? getPlayerName(room, winner.seat) : null;
    const discarderName = winner?.discarderSeat !== undefined
      ? getPlayerName(room, winner.discarderSeat)
      : null;
    const gameLogs = sessionScores?.gameLogs || {};
    const winnerExposedMelds = winner
      ? gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds] || []
      : [];

    // Transform function for spectators
    const transformForSpectator = (entry: string) => transformLogEntry(entry, room);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-4">
        {/* Spectator Banner */}
        <div className="bg-purple-500/30 border border-purple-500/50 rounded-lg px-3 py-2 mb-4 flex items-center justify-center gap-2">
          <span className="text-purple-200 text-sm font-medium">
            Spectating
          </span>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-4">
            {winner ? (
              <>
                <div className="text-4xl mb-2">Winner!</div>
                <div className="text-2xl text-emerald-400 mb-2">{winnerName}</div>
                <div className="text-base text-slate-300 mb-2">
                  {winner.isThreeGolds
                    ? 'Instant win with 3 Gold tiles!'
                    : winner.isRobbingGold
                      ? 'Claimed the revealed Gold tile!'
                      : winner.isSelfDraw
                        ? 'Won by self-draw'
                        : `Won on ${discarderName}'s discard`}
                </div>
                <div className="inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xl font-bold px-5 py-1.5 rounded-full shadow-lg">
                  +{winner.score.total} points
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">Draw Game</div>
                <div className="text-xl text-slate-300">Wall exhausted - no winner</div>
                <p className="text-slate-400 mt-1">No payment this round. Dealer stays.</p>
              </>
            )}
          </div>

          {/* 2-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Left column - Hands */}
            <div className="flex flex-col gap-4">
              {/* Winning Hand (winner only) */}
              {winner && winner.hand && (
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <h3 className="text-lg font-semibold text-amber-400 mb-2">Winning Hand</h3>
                  <WinningHand
                    hand={winner.hand}
                    goldTileType={gameState.goldTileType}
                    exposedMelds={winnerExposedMelds}
                    winningTile={winner.winningTile}
                    isThreeGolds={winner.isThreeGolds}
                  />
                </div>
              )}
            </div>

            {/* Right column - Scores */}
            <div className="flex flex-col gap-4">
              {/* Score Breakdown (winner only) */}
              {winner && (
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <h3 className="text-lg font-semibold text-amber-400 mb-2">Score Breakdown</h3>
                  <ScoreBreakdown winner={winner} />
                </div>
              )}

              {/* Session Scores */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <SessionScoresTable
                  room={room}
                  sessionScores={sessionScores}
                  highlightSeat={winner?.seat}
                />
              </div>

              {/* Game Log Tabs */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <GameLogTabs
                  currentLog={actionLog}
                  archivedLogs={gameLogs}
                  sessionScores={sessionScores}
                  room={room}
                  transformEntry={transformForSpectator}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active game view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-2 sm:p-3">
      {/* Spectator Banner */}
      <div className="bg-purple-500/30 border border-purple-500/50 rounded-lg px-3 py-2 mb-2 flex items-center justify-center gap-2">
        <span className="text-purple-200 text-sm font-medium">
          Spectating
        </span>
        <span className="text-purple-400 text-xs">
          (You are watching this game)
        </span>
      </div>

      {/* Connection status banner */}
      <ConnectionBanner
        status={connectionStatus}
        disconnectedAt={disconnectedAt}
        onRetry={onRetry}
      />

      {/* Header - simplified for spectators */}
      <GameHeader
        roomCode={roomCode}
        goldTileType={gameState.goldTileType}
        exposedGold={gameState.exposedGold}
        wallCount={gameState.wall?.length ?? 0}
        currentPlayerSeat={gameState.currentPlayerSeat}
        isCallingPhase={gameState.phase === 'calling'}
        isMyTurn={false}
        shouldDraw={false}
        chowSelectionMode={false}
        room={room}
        timerRemainingSeconds={callingTimerRemaining}
        timerIsWarning={callingTimerIsWarning}
        turnTimerRemainingSeconds={turnTimerRemaining}
        turnTimerIsWarning={turnTimerIsWarning}
        onSettingsClick={() => {}}
        onRulesClick={() => {}}
        getPlayerName={getPlayerName}
      />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3">
        {/* Left column: Turn Indicator + Previous Action + Last Discard */}
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {/* Turn Indicator */}
          <TurnIndicator
            currentActor={gameState.currentPlayerSeat}
            previousActor={gameState.lastAction?.playerSeat ?? null}
            mySeat={0} // Default to seat 0 for spectators
          />

          {/* Previous Action */}
          <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600 flex flex-col items-center justify-center">
            {gameState.previousAction ? (
              <>
                <span className="text-slate-300 text-xs sm:text-lg font-medium mb-1 sm:mb-2">
                  {gameState.previousAction.type === 'pung' ? 'Peng' :
                   gameState.previousAction.type === 'chow' ? 'Chi' :
                   gameState.previousAction.type === 'kong' ? 'Gang' :
                   gameState.previousAction.type}
                </span>
                {gameState.previousAction.type === 'draw' || !gameState.previousAction.tile ? (
                  <div className="w-8 h-10 sm:w-12 sm:h-16 bg-emerald-700 rounded border-2 border-emerald-500 flex items-center justify-center">
                    <span className="text-emerald-300 text-xs sm:text-sm">?</span>
                  </div>
                ) : (
                  <Tile tileId={gameState.previousAction.tile} goldTileType={gameState.goldTileType} size="md" />
                )}
                <span className="text-white text-xs sm:text-lg mt-1 sm:mt-2">
                  by <span className="font-semibold">{getPlayerName(room, gameState.previousAction.playerSeat)}</span>
                </span>
              </>
            ) : (
              <span className="text-slate-400 text-sm sm:text-lg">-</span>
            )}
          </div>

          {/* Last Discard */}
          <div className={`rounded-xl p-2 sm:p-4 border flex flex-col items-center justify-center ${
            gameState.lastAction?.type === 'discard' && gameState.lastAction.tile
              ? 'bg-red-500/20 border-red-500/40'
              : 'bg-slate-800/50 border-slate-600'
          }`}>
            {gameState.lastAction?.type === 'discard' && gameState.lastAction.tile ? (
              <>
                <span className="text-red-300 text-xs sm:text-lg font-medium mb-1 sm:mb-2">Discarded</span>
                <Tile tileId={gameState.lastAction.tile} goldTileType={gameState.goldTileType} size="md" />
                <span className="text-white text-xs sm:text-lg mt-1 sm:mt-2">
                  by <span className="font-semibold">{getPlayerName(room, gameState.lastAction.playerSeat)}</span>
                </span>
              </>
            ) : (
              <span className="text-slate-400 text-sm sm:text-lg">-</span>
            )}
          </div>
        </div>

        {/* Discard Pile */}
        <DiscardPile
          discardPile={gameState.discardPile || []}
          goldTileType={gameState.goldTileType}
        />
      </div>

      {/* All Players Grid */}
      <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600 mb-2 sm:mb-3">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Players</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
            const player = room.players[`seat${seat}` as keyof typeof room.players];
            if (!player) return null;

            const isDealer = gameState.dealerSeat === seat;
            const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
            const bonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];
            const isCurrentTurn = gameState.currentPlayerSeat === seat;

            // Calculate tile count
            const kongCount = exposedMelds.filter(m => m.type === 'kong').length;
            const needsDiscard = isCurrentTurn && !needsToDraw(gameState);
            const totalTiles = 16 + kongCount + (needsDiscard ? 1 : 0);
            const tilesInMelds = exposedMelds.reduce((sum, meld) => sum + meld.tiles.length, 0);
            const tileCount = totalTiles - tilesInMelds;

            return (
              <div
                key={seat}
                className={`p-2 sm:p-3 rounded-lg ${
                  isCurrentTurn
                    ? 'bg-emerald-500/25 border-2 border-emerald-500/50'
                    : 'bg-slate-700/40 border border-slate-600'
                }`}
              >
                {/* Player info */}
                <div className="flex flex-col mb-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    {player.isBot && <span className="text-cyan-400 text-xs sm:text-sm">Bot</span>}
                    <span className={`font-semibold text-sm truncate ${isCurrentTurn ? 'text-emerald-200' : 'text-white'}`}>
                      {player.name}
                    </span>
                    {isDealer && <span className="bg-amber-500 text-black text-[10px] sm:text-xs px-1 py-0.5 rounded font-bold">D</span>}
                    {player.connected === false && !player.isBot && (
                      <span className="bg-red-500/60 text-white text-[10px] sm:text-xs px-1 py-0.5 rounded font-medium">
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                    <span>{tileCount} tiles</span>
                    {bonusTiles.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400 font-bold">+{bonusTiles.length} bonus</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Exposed Melds */}
                {exposedMelds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {exposedMelds.map((meld, meldIdx) => (
                      <div
                        key={meldIdx}
                        className={`flex items-center gap-0.5 rounded p-0.5 ${
                          meld.isConcealed ? 'bg-blue-900/50' : 'bg-slate-800/70'
                        }`}
                      >
                        {meld.tiles.length === 4 ? (
                          <>
                            <Tile tileId={meld.tiles[0]} goldTileType={gameState.goldTileType} size="sm" faceDown={meld.isConcealed} />
                            <span className="bg-amber-500 text-black text-[10px] px-1 py-0.5 rounded font-bold">x4</span>
                          </>
                        ) : (
                          meld.tiles.map((tile, i) => (
                            <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" faceDown={meld.isConcealed} />
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bonus Tiles */}
                {bonusTiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-0.5 mt-1">
                    {bonusTiles.map((tile, i) => (
                      <Tile key={i} tileId={tile} goldTileType={gameState.goldTileType} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Game Log */}
      <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Game Log</h3>
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {actionLog.length > 0 ? (
            actionLog.map((entry, index) => (
              <div key={index} className="text-xs py-0.5 text-slate-400">
                {transformLogEntry(entry, room)}
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-500 italic">No actions yet</div>
          )}
        </div>
      </div>

      {/* Session Scores (if available) */}
      {sessionScores && sessionScores.rounds && sessionScores.rounds.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600 mt-2 sm:mt-3">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">Session Summary</h3>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {sessionScores.rounds.map((round) => {
              const winnerName = round.winnerSeat !== null
                ? getPlayerName(room, round.winnerSeat)
                : null;

              return (
                <div key={round.roundNumber} className="text-xs text-slate-400">
                  {round.winnerSeat !== null ? (
                    <span>
                      {round.roundNumber}. {winnerName}{' '}
                      <span className="text-emerald-400">+{round.score}</span>
                    </span>
                  ) : (
                    <span>{round.roundNumber}. Draw</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
