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
          <h1 className="text-5xl font-bold mb-4">🀄 Mahjong Vibes</h1>
        </div>

        <div className="max-w-md mx-auto space-y-6">
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

          {/* Game Actions */}
          <div className="bg-green-800/50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Play</h2>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/create')}
                disabled={!user || loading}
                className="w-full py-4 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold text-lg rounded-lg transition-colors"
              >
                {loading ? 'Connecting...' : 'Create Room'}
              </button>
              <button
                onClick={() => router.push('/join')}
                disabled={!user || loading}
                className="w-full py-4 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-lg transition-colors"
              >
                {loading ? 'Connecting...' : 'Join Room'}
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
