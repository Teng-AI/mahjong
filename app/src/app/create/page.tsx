'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createRoom } from '@/lib/rooms';

export default function CreateRoomPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('Not authenticated');
      return;
    }

    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const roomCode = await createRoom(user.uid, playerName.trim());
      router.push(`/room/${roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
      setCreating(false);
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
            <h1 className="text-4xl font-bold mb-2">Create Room</h1>
            <p className="text-green-200">Start a new game of Mahjong Vibes</p>
          </div>

          <form onSubmit={handleCreate} className="bg-green-800/50 rounded-lg p-6 space-y-6">
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
                disabled={creating}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={creating || !user}
              className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-500 text-black font-semibold rounded-lg transition-colors"
            >
              {creating ? 'Creating Room...' : 'Create Room'}
            </button>
          </form>

          <div className="mt-6 text-center text-green-400 text-sm">
            <p>You will be the host and can set the dealer</p>
          </div>
        </div>
      </div>
    </div>
  );
}
