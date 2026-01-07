'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { joinRoom, findUserSeat } from '@/lib/rooms';
import { initializeGame } from '@/lib/game';
import { SeatIndex, RoomPlayer } from '@/types';

const SEAT_LABELS = ['East', 'South', 'West', 'North'] as const;
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
  canSetDealer: boolean;
  canKick: boolean;
}

function PlayerSlot({
  seat,
  player,
  isDealer,
  isPlayerHost,
  isSelf,
  onSetDealer,
  onKick,
  canSetDealer,
  canKick,
}: PlayerSlotProps) {
  return (
    <div
      className={`relative p-4 rounded-lg border-2 transition-all ${
        player
          ? `${SEAT_COLORS[seat]} border-transparent`
          : 'bg-green-900/30 border-dashed border-green-600'
      } ${isSelf ? 'ring-2 ring-yellow-400' : ''}`}
    >
      {/* Seat label */}
      <div className="text-xs font-semibold text-green-200 mb-1">
        {SEAT_LABELS[seat]}
      </div>

      {player ? (
        <div className="space-y-1">
          <div className="font-semibold text-lg flex items-center gap-2">
            {player.name}
            {isSelf && <span className="text-xs text-yellow-300">(You)</span>}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {isDealer && (
              <span className="px-2 py-0.5 bg-yellow-500 text-black rounded text-xs font-bold">
                DEALER
              </span>
            )}
            {isPlayerHost && (
              <span className="px-2 py-0.5 bg-white/20 rounded text-xs">
                Host
              </span>
            )}
            {!player.connected && (
              <span className="text-yellow-400 text-xs">Disconnected</span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-green-400 italic">Waiting for player...</div>
      )}

      {/* Host action buttons */}
      {player && (canSetDealer || canKick) && (
        <div className="absolute top-2 right-2 flex gap-1">
          {canSetDealer && !isDealer && (
            <button
              onClick={onSetDealer}
              className="px-2 py-1 text-xs bg-yellow-500/80 hover:bg-yellow-500 text-black rounded transition-colors"
            >
              Dealer
            </button>
          )}
          {canKick && (
            <button
              onClick={onKick}
              className="px-2 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded transition-colors"
            >
              Kick
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

  const {
    room,
    loading: roomLoading,
    error: roomError,
    mySeat,
    isHost,
    playerCount,
    isFull,
    setDealerSeat,
    startGame,
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
      console.error('Failed to start game:', err);
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
              <div className="text-3xl font-mono tracking-widest text-yellow-400">
                {roomCode}
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
            <div className="text-3xl font-mono tracking-widest text-yellow-400 mt-1">
              {roomCode}
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
              return (
                <PlayerSlot
                  key={seat}
                  seat={seat}
                  player={player}
                  isDealer={dealerSeat === seat}
                  isPlayerHost={isPlayerHost}
                  isSelf={isSelf}
                  onSetDealer={() => setDealerSeat(seat)}
                  onKick={() => kickPlayer(seat)}
                  canSetDealer={isHost && player !== null}
                  canKick={isHost && player !== null && !isSelf && !isPlayerHost}
                />
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        <div className="max-w-2xl mx-auto mb-8 bg-green-800/30 rounded-lg p-4">
          <h3 className="font-semibold mb-2">How to Play</h3>
          <ul className="text-sm text-green-300 space-y-1">
            <li>• Share the room code with friends to invite them</li>
            <li>• The host can select which player will be the dealer</li>
            <li>• Game starts when all 4 players have joined</li>
          </ul>
        </div>

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
