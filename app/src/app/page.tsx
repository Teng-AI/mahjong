'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function Home() {
  const router = useRouter();
  const { user, loading, error } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">🀄 Fujian Mahjong</h1>
          <p className="text-xl text-green-200">Gold Rush Mahjong (金麻将)</p>
        </div>

        <div className="max-w-md mx-auto space-y-6">
          {/* Game Actions */}
          <div className="bg-green-800/50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Play</h2>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/create')}
                disabled={!user}
                className="w-full py-4 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold text-lg rounded-lg transition-colors"
              >
                Create Room
              </button>
              <button
                onClick={() => router.push('/join')}
                disabled={!user}
                className="w-full py-4 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-lg transition-colors"
              >
                Join Room
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
