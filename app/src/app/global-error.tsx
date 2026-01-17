'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  // global-error must include html and body tags since it replaces root layout
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full text-center border-2 border-slate-600">
            <div className="text-6xl mb-4">💥</div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Critical Error
            </h1>
            <p className="text-slate-400 mb-6">
              Something went seriously wrong. Please refresh the page or return home.
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
                Try Again
              </button>
              {/* Using <a> instead of Link because root layout is broken */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors inline-block"
              >
                Return Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
