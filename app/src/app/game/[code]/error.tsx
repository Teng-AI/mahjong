'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GameError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full text-center border-2 border-slate-600">
        <div className="text-6xl mb-4">🀄</div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Game Error
        </h1>
        <p className="text-slate-400 mb-6">
          Something went wrong during the game. You can try to rejoin or start a new game.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-3 mb-6 text-left">
            <p className="text-red-300 text-sm font-mono break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
          >
            Rejoin Game
          </button>
          <Link
            href="/"
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors inline-block"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
