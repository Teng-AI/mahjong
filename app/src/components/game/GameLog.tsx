'use client';

import { useRef, useEffect } from 'react';

export interface GameLogProps {
  entries: string[];
  transformEntry?: (entry: string) => string;
}

export function GameLog({ entries, transformEntry }: GameLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const mobileLogRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    if (mobileLogRef.current) {
      mobileLogRef.current.scrollTop = mobileLogRef.current.scrollHeight;
    }
  }, [entries.length]);

  const transform = transformEntry || ((entry: string) => entry);

  return (
    <>
      {/* Desktop Game Log */}
      <div className="hidden md:block bg-slate-800/50 rounded-xl p-2 sm:p-4 border border-slate-600 mt-2 sm:mt-3">
        <div className="text-sm sm:text-lg text-slate-300 font-medium mb-2 sm:mb-3">Game Log</div>
        <div ref={logRef} className="max-h-24 overflow-y-auto space-y-0.5 sm:space-y-1">
          {entries.map((entry, index, arr) => (
            <div
              key={index}
              className={`text-xs sm:text-lg py-0.5 ${index === arr.length - 1 ? 'text-white font-medium' : 'text-slate-300'}`}
            >
              {transform(entry)}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Game Log */}
      <div className="md:hidden bg-slate-800/50 rounded-xl p-2 border border-slate-600 mt-2 mb-20">
        <div className="text-sm text-slate-300 font-medium mb-2">Game Log</div>
        <div ref={mobileLogRef} className="max-h-24 overflow-y-auto space-y-0.5">
          {entries.map((entry, index, arr) => (
            <div
              key={index}
              className={`text-xs py-0.5 ${index === arr.length - 1 ? 'text-white font-medium' : 'text-slate-300'}`}
            >
              {transform(entry)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
