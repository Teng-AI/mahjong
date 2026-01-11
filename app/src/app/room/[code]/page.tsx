'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { joinRoom, findUserSeat, fillWithBots, addBotPlayer, removePlayer } from '@/lib/rooms';
import { initializeGame } from '@/lib/game';
import { SeatIndex, RoomPlayer, BotDifficulty } from '@/types';

// Debug logging - only enabled in development
const DEBUG_ROOM = process.env.NODE_ENV === 'development';

const SEAT_COLORS = [
  'bg-blue-600',
  'bg-red-600',
  'bg-green-600',
  'bg-purple-600',
] as const;

interface PlayerSlotProps {
  seat: SeatIndex;
  player: RoomPlayer | null;
  isDealer: boolean;
  isPlayerHost: boolean;
  isSelf: boolean;
  onSetDealer: () => void;
  onKick: () => void;
  onAddBot: () => void;
  canSetDealer: boolean;
  canKick: boolean;
  canAddBot: boolean;
}

function PlayerSlot({
  seat,
  player,
  isDealer,
  isPlayerHost,
  isSelf,
  onSetDealer,
  onKick,
  onAddBot,
  canSetDealer,
  canKick,
  canAddBot,
}: PlayerSlotProps) {
  return (
    <div
      className={`p-3 rounded-xl border-2 transition-all min-h-[88px] flex flex-col ${
        player
          ? `${SEAT_COLORS[seat]} border-transparent`
          : 'bg-green-900/30 border-dashed border-green-600'
      } ${isSelf ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-green-950' : ''}`}
    >
      {player ? (
        <div className="flex flex-col h-full">
          {/* Row 1: Name and action buttons */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {player.isBot && <span className="text-lg flex-shrink-0">🤖</span>}
              <span className="font-semibold text-base truncate">{player.name}</span>
              {isSelf && <span className="text-xs text-yellow-300 flex-shrink-0">(You)</span>}
            </div>
            {/* Action buttons inline with name */}
            {(canSetDealer || canKick) && (
              <div className="flex gap-1 flex-shrink-0">
                {canSetDealer && !isDealer && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetDealer(); }}
                    className="px-2 py-1 text-[11px] bg-black/30 hover:bg-yellow-500 hover:text-black text-white rounded transition-colors font-medium"
                  >
                    Dealer
                  </button>
                )}
                {canKick && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onKick(); }}
                    className="px-2 py-1 text-[11px] bg-black/30 hover:bg-red-500 text-white rounded transition-colors font-medium"
                  >
                    {player.isBot ? 'Remove' : 'Kick'}
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Row 2: Badges */}
          <div className="flex items-center gap-1.5 flex-wrap mt-auto">
            {isDealer && (
              <span className="px-2 py-0.5 bg-yellow-500 text-black rounded text-[11px] font-bold">
                DEALER
              </span>
            )}
            {isPlayerHost && (
              <span className="px-2 py-0.5 bg-white/20 rounded text-[11px]">
                Host
              </span>
            )}
            {player.isBot && (
              <span className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap ${
                player.botDifficulty === 'easy'
                  ? 'bg-black/20 text-green-200'
                  : player.botDifficulty === 'hard'
                  ? 'bg-black/20 text-red-200'
                  : 'bg-black/20 text-yellow-200'
              }`}>
                {player.botDifficulty ? `${player.botDifficulty.charAt(0).toUpperCase()}` : '?'} Bot
              </span>
            )}
            {!player.connected && !player.isBot && (
              <span className="text-yellow-400 text-[11px]">Disconnected</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between h-full">
          <span className="text-green-400/70 italic text-sm">Waiting...</span>
          {canAddBot && (
            <button
              onClick={onAddBot}
              className="px-3 py-1.5 text-xs bg-cyan-600/80 hover:bg-cyan-600 text-white rounded-lg transition-colors font-medium"
            >
              + Add Bot
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string).toUpperCase();

  const { user, loading: authLoading } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [shouldAutoJoin, setShouldAutoJoin] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [copied, setCopied] = useState(false);

  const copyRoomLink = useCallback(async () => {
    const roomUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = roomUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const {
    room,
    loading: roomLoading,
    error: roomError,
    mySeat,
    isHost,
    playerCount,
    isFull,
    setDealerSeat,
    kickPlayer,
  } = useRoom({
    roomCode,
    userId: user?.uid || null,
  });

  // Get stored player name from sessionStorage (from join page)
  // Only auto-join if name came from sessionStorage (user already submitted join form)
  useEffect(() => {
    const storedName = sessionStorage.getItem('playerName');
    if (storedName) {
      setPlayerName(storedName);
      setShouldAutoJoin(true);
      sessionStorage.removeItem('playerName');
    }
  }, []);

  // Redirect to game when game starts and player has a seat
  useEffect(() => {
    if (room?.status === 'playing' && mySeat !== null) {
      router.push(`/game/${roomCode}`);
    }
  }, [room?.status, mySeat, router, roomCode]);

  // Auto-join only when shouldAutoJoin is true (name came from join page)
  useEffect(() => {
    if (
      shouldAutoJoin &&
      !authLoading &&
      !roomLoading &&
      user &&
      room &&
      mySeat === null &&
      playerName &&
      !joining
    ) {
      // Check if user is already in the room (reconnecting)
      const existingSeat = findUserSeat(room, user.uid);
      if (existingSeat !== null) {
        setShouldAutoJoin(false);
        return; // Already in room, subscription will update mySeat
      }

      // Try to join
      setShouldAutoJoin(false);
      setJoining(true);
      joinRoom(roomCode, user.uid, playerName)
        .catch((err) => {
          setJoinError(err.message);
        })
        .finally(() => {
          setJoining(false);
        });
    }
  }, [
    shouldAutoJoin,
    authLoading,
    roomLoading,
    user,
    room,
    mySeat,
    playerName,
    joining,
    roomCode,
  ]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !playerName.trim()) return;

    setJoining(true);
    setJoinError(null);

    try {
      await joinRoom(roomCode, user.uid, playerName.trim());
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!room) return;

    try {
      const dealerSeat = room.settings?.dealerSeat ?? 0;
      await initializeGame(roomCode, dealerSeat);
      // Room status will update to 'playing' and redirect to game
      router.push(`/game/${roomCode}`);
    } catch (err) {
      if (DEBUG_ROOM) console.error('Failed to start game:', err);
    }
  };

  const handleAddBotToSeat = async (_seat: SeatIndex) => {
    if (addingBot) return;
    setAddingBot(true);
    try {
      await addBotPlayer(roomCode, botDifficulty);
    } catch (err) {
      if (DEBUG_ROOM) console.error('Failed to add bot:', err);
    } finally {
      setAddingBot(false);
    }
  };

  const handleFillWithBots = async () => {
    if (addingBot) return;
    setAddingBot(true);
    try {
      await fillWithBots(roomCode, botDifficulty);
    } catch (err) {
      if (DEBUG_ROOM) console.error('Failed to fill with bots:', err);
    } finally {
      setAddingBot(false);
    }
  };

  const handleRemoveBot = async (seat: SeatIndex) => {
    try {
      await removePlayer(roomCode, seat);
    } catch (err) {
      if (DEBUG_ROOM) console.error('Failed to remove bot:', err);
    }
  };

  // Loading state
  if (authLoading || roomLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-green-400">Room: {roomCode}</div>
        </div>
      </div>
    );
  }

  // Room not found
  if (roomError || !room) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4 text-red-400">Room Not Found</div>
          <p className="text-green-300 mb-6">
            The room &quot;{roomCode}&quot; does not exist or has been closed.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Game already started
  if (room.status === 'playing') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Game In Progress</div>
          <p className="text-green-300 mb-6">
            {mySeat !== null
              ? 'Redirecting to game...'
              : 'This game has already started.'}
          </p>
          {mySeat === null && (
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition-colors"
            >
              Back to Home
            </button>
          )}
        </div>
      </div>
    );
  }

  // Not in room - show join form
  if (mySeat === null && !joining) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => router.push('/')}
              className="mb-8 text-green-300 hover:text-white transition-colors"
            >
              ← Back to Home
            </button>

            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-2">Join Room</h1>
              <div className="flex items-center justify-center gap-2">
                <div className="text-3xl font-mono tracking-widest text-yellow-400">
                  {roomCode}
                </div>
                <button
                  onClick={copyRoomLink}
                  className="px-2 py-1 bg-green-700/50 hover:bg-green-600/50 border border-green-500/50 rounded text-sm transition-colors"
                  title="Copy room link"
                >
                  {copied ? '✓ Copied!' : 'Share'}
                </button>
              </div>
              <p className="text-green-200 mt-2">
                {playerCount}/4 players • {isFull ? 'Room Full' : 'Waiting for players'}
              </p>
            </div>

            {isFull ? (
              <div className="bg-red-900/50 rounded-lg p-6 text-center">
                <p className="text-red-300">This room is full.</p>
              </div>
            ) : (
              <form onSubmit={handleJoin} className="bg-green-800/50 rounded-lg p-6 space-y-6">
                <div>
                  <label htmlFor="playerName" className="block text-sm font-medium mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="playerName"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={20}
                    className="w-full px-4 py-3 bg-green-900/50 border border-green-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white placeholder-green-400"
                    disabled={joining}
                  />
                </div>

                {joinError && <p className="text-red-400 text-sm">{joinError}</p>}

                <button
                  type="submit"
                  disabled={joining || !playerName.trim()}
                  className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-500 text-black font-semibold rounded-lg transition-colors"
                >
                  {joining ? 'Joining...' : 'Join Game'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // In room - show lobby
  const dealerSeat = room.settings?.dealerSeat ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-green-300 hover:text-white transition-colors"
          >
            ← Leave Room
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Room Lobby</h1>
            <div className="flex items-center justify-center gap-2 mt-1">
              <div className="text-3xl font-mono tracking-widest text-yellow-400">
                {roomCode}
              </div>
              <button
                onClick={copyRoomLink}
                className="px-2 py-1 bg-green-700/50 hover:bg-green-600/50 border border-green-500/50 rounded text-sm transition-colors"
                title="Copy room link"
              >
                {copied ? '✓ Copied!' : 'Share'}
              </button>
            </div>
          </div>
          <div className="text-right text-green-300">
            <div>{playerCount}/4 players</div>
            {isHost && <div className="text-yellow-400 text-sm">You are the host</div>}
          </div>
        </div>

        {/* Player slots */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="grid grid-cols-2 gap-4">
            {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
              const seatKey = `seat${seat}` as keyof typeof room.players;
              const player = room.players[seatKey];
              const isPlayerHost = player?.id === room.hostId;
              const isSelf = mySeat === seat;
              const isBot = player?.isBot ?? false;
              return (
                <PlayerSlot
                  key={seat}
                  seat={seat}
                  player={player}
                  isDealer={dealerSeat === seat}
                  isPlayerHost={isPlayerHost}
                  isSelf={isSelf}
                  onSetDealer={() => setDealerSeat(seat)}
                  onKick={() => isBot ? handleRemoveBot(seat) : kickPlayer(seat)}
                  onAddBot={() => handleAddBotToSeat(seat)}
                  canSetDealer={isHost && player !== null}
                  canKick={isHost && player !== null && !isSelf && !isPlayerHost}
                  canAddBot={isHost && player === null && !addingBot}
                />
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        <div className="max-w-2xl mx-auto mb-8 bg-green-800/30 rounded-lg p-4">
          <h3 className="font-semibold mb-2">How to Play</h3>
          <ul className="text-sm text-green-300 space-y-1">
            <li>• Share the room link with friends to invite them</li>
            <li>• The host can select which player will be the dealer</li>
            <li>• Game starts when all 4 players have joined</li>
            <li>• Not enough players? Add AI bots to fill empty seats!</li>
          </ul>
        </div>

        {/* Bot difficulty selector and Fill with Bots button (host only, if room not full) */}
        {isHost && !isFull && (
          <div className="max-w-md mx-auto mb-6 space-y-3">
            {/* Difficulty selector */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-green-300 text-sm">Bot Difficulty:</span>
              <div className="flex rounded-lg overflow-hidden border border-green-600">
                {(['easy', 'medium', 'hard'] as BotDifficulty[]).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setBotDifficulty(diff)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                      botDifficulty === diff
                        ? diff === 'easy'
                          ? 'bg-green-500 text-white'
                          : diff === 'medium'
                          ? 'bg-yellow-500 text-black'
                          : 'bg-red-500 text-white'
                        : 'bg-green-900/50 text-green-300 hover:bg-green-800/50'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleFillWithBots}
              disabled={addingBot}
              className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>🤖</span>
              {addingBot ? 'Adding Bots...' : `Fill Empty Seats with ${botDifficulty.charAt(0).toUpperCase() + botDifficulty.slice(1)} Bots`}
            </button>
          </div>
        )}

        {/* Start Game button (host only) */}
        {isHost && (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleStartGame}
              disabled={!isFull}
              className="w-full py-4 px-6 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold text-xl rounded-lg transition-colors"
            >
              {isFull ? 'Start Game' : `Waiting for ${4 - playerCount} more player${4 - playerCount > 1 ? 's' : ''}...`}
            </button>
            {!isFull && (
              <p className="text-center text-green-400 text-sm mt-2">
                All 4 seats must be filled to start
              </p>
            )}
          </div>
        )}

        {/* Non-host waiting message */}
        {!isHost && (
          <div className="max-w-md mx-auto text-center">
            <div className="bg-green-800/50 rounded-lg p-4">
              <p className="text-green-300">
                {isFull
                  ? 'Waiting for host to start the game...'
                  : 'Waiting for more players to join...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
