'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createRoom, fillWithBots } from '@/lib/rooms';
import { initializeGame } from '@/lib/game';
import { ref, update } from 'firebase/database';
import { db } from '@/firebase/config';
import type { BotDifficulty } from '@/types';

export default function Home() {
  const router = useRouter();
  const { user, loading, error } = useAuth();
  const [quickPlayLoading, setQuickPlayLoading] = useState<BotDifficulty | null>(null);

  const handleQuickPlay = async (difficulty: BotDifficulty) => {
    if (!user || quickPlayLoading) return;

    setQuickPlayLoading(difficulty);

    try {
      // Create room with name "You"
      const roomCode = await createRoom(user.uid, 'You');

      // Set timers to 30 seconds
      await update(ref(db, `rooms/${roomCode}/settings`), {
        callingTimerSeconds: 30,
        turnTimerSeconds: 30,
        dealerSeat: 0, // Player is dealer
      });

      // Fill with 3 bots
      await fillWithBots(roomCode, difficulty);

      // Start the game
      await initializeGame(roomCode, 0);

      // Redirect to game
      router.push(`/game/${roomCode}`);
    } catch (err) {
      console.error('Quick play failed:', err);
      setQuickPlayLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-2">🀄 Mahjong Vibes</h1>
          <p className="text-sm text-emerald-400/80">Fujianese Style</p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          {/* Auth Status */}
          {loading && (
            <div className="bg-blue-800/30 border border-blue-600/50 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-blue-200">Connecting...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-800/30 border border-red-600/50 rounded-lg p-4 text-center">
              <span className="text-red-200">Connection failed. Please refresh the page.</span>
            </div>
          )}

          {/* Create Room */}
          <button
            onClick={() => router.push('/create')}
            disabled={!user || loading}
            className="w-full py-4 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold text-lg rounded-lg transition-colors"
          >
            {loading ? 'Connecting...' : 'Create Room'}
          </button>

          {/* Join Room */}
          <button
            onClick={() => router.push('/join')}
            disabled={!user || loading}
            className="w-full py-4 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-lg transition-colors"
          >
            {loading ? 'Connecting...' : 'Join Room'}
          </button>

          {/* Quick Play */}
          <div className="bg-green-800/50 rounded-lg p-5">
            <div className="text-center mb-3">
              <h2 className="text-lg font-semibold">⚡ Quick Play</h2>
              <p className="text-green-300 text-sm">Play vs 3 bots</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleQuickPlay('easy')}
                disabled={!user || loading || quickPlayLoading !== null}
                className="flex-1 py-3 px-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {quickPlayLoading === 'easy' ? '...' : 'Easy'}
              </button>
              <button
                onClick={() => handleQuickPlay('medium')}
                disabled={!user || loading || quickPlayLoading !== null}
                className="flex-1 py-3 px-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {quickPlayLoading === 'medium' ? '...' : 'Medium'}
              </button>
              <button
                onClick={() => handleQuickPlay('hard')}
                disabled={!user || loading || quickPlayLoading !== null}
                className="flex-1 py-3 px-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {quickPlayLoading === 'hard' ? '...' : 'Hard'}
              </button>
            </div>
          </div>

          {/* How to Play */}
          <div className="bg-green-800/30 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">How to Play</h2>
            <ol className="text-green-300 text-sm space-y-2">
              <li>1. Create a room to get a 6-character code</li>
              <li>2. Share the code with 3 friends</li>
              <li>3. Once all 4 players join, start the game</li>
              <li>4. The host selects who deals first</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
