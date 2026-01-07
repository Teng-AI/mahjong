'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { roomExists } from '@/lib/rooms';

export default function JoinRoomPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('Not authenticated');
      return;
    }

    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError('Please enter a room code');
      return;
    }

    if (code.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setChecking(true);
    setError(null);

    try {
      // Check if room exists first
      const exists = await roomExists(code);
      if (!exists) {
        setError('Room not found');
        setChecking(false);
        return;
      }

      // Store name in sessionStorage for the room page to use
      sessionStorage.setItem('playerName', playerName.trim());
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check room');
      setChecking(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white flex items-center justify-center">
        <p className="text-xl">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          {/* Back button */}
          <button
            onClick={() => router.push('/')}
            className="mb-8 text-green-300 hover:text-white transition-colors"
          >
            ← Back to Home
          </button>

          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">Join Room</h1>
            <p className="text-green-200">Enter a room code to join a game</p>
          </div>

          <form onSubmit={handleJoin} className="bg-green-800/50 rounded-lg p-6 space-y-6">
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium mb-2">
                Room Code
              </label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                maxLength={6}
                className="w-full px-4 py-3 bg-green-900/50 border border-green-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white placeholder-green-400 text-center text-2xl tracking-widest font-mono uppercase"
                disabled={checking}
              />
            </div>

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
                disabled={checking}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={checking || !user}
              className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-500 text-black font-semibold rounded-lg transition-colors"
            >
              {checking ? 'Checking...' : 'Join Room'}
            </button>
          </form>

          <div className="mt-6 text-center text-green-400 text-sm">
            <p>Ask the host for the 6-character room code</p>
          </div>
        </div>
      </div>
    </div>
  );
}
