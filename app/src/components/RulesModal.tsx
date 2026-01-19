'use client';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg p-4 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-amber-400 font-bold text-xl">How to Play</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <p className="text-xs text-emerald-400/80 mb-4">福州麻将 (Fuzhou Mahjong)</p>

        {/* Quick Start */}
        <div className="text-sm text-slate-300 space-y-1.5 mb-4">
          <p><strong className="text-white">Goal:</strong> Form <strong className="text-white">5 sets + 1 pair</strong> (17 tiles)</p>
          <p><strong className="text-white">Sets:</strong> Peng (3 of a kind) or Chi (3 in sequence, same suit)</p>
          <p><strong className="text-white">Your Turn:</strong> Draw (or Call) → Discard (or Hu/Gang)</p>
          <p><strong className="text-white">Calling:</strong> Claim a discard to form a set (skips your draw)</p>
        </div>

        <hr className="border-slate-600 my-3" />

        {/* Tiles */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Tiles</h4>
        <div className="text-sm text-slate-300 space-y-1 mb-4">
          <p><strong className="text-white">Suits</strong> — Dots, Bamboo, Characters (1-9 each) — can form sets</p>
          <p><strong className="text-white">Bonus</strong> — Winds &amp; Dragon — <em className="text-slate-400">cannot form any sets</em></p>
        </div>

        <hr className="border-slate-600 my-3" />

        {/* Gold Tile */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Gold Tile</h4>
        <div className="text-sm text-slate-300 space-y-1 mb-4">
          <p>• One random suit tile becomes the <strong className="text-white">wildcard</strong> each round</p>
          <p>• Only <strong className="text-white">3 Gold tiles</strong> in play (4th is revealed and removed)</p>
          <p>• Can substitute for <strong className="text-white">any suited tile</strong> in sets or pairs</p>
          <p>• <em className="text-slate-400">Cannot be discarded or used for calling</em></p>
          <p>• Each Gold in winning hand = <strong className="text-emerald-400">+1 point</strong></p>
        </div>

        <hr className="border-slate-600 my-3" />

        {/* Bonus Tiles */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Bonus Tiles</h4>
        <div className="text-sm text-slate-300 space-y-1 mb-4">
          <p>• Winds &amp; Dragon are <strong className="text-white">automatically exposed</strong> at game start</p>
          <p>• You draw replacements until none remain in hand</p>
          <p>• <em className="text-slate-400">Cannot form any sets — purely for points</em></p>
          <p>• Each bonus tile = <strong className="text-emerald-400">+1 point</strong></p>
        </div>

        <hr className="border-slate-600 my-3" />

        {/* Calling */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Calling</h4>
        <div className="text-sm text-slate-300 mb-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="pb-1.5">Call</th>
                <th className="pb-1.5">Need</th>
                <th className="pb-1.5">From</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-0.5"><strong className="text-white">Chi (吃)</strong></td><td>2 sequential</td><td className="text-slate-400">Left player only</td></tr>
              <tr><td className="py-0.5"><strong className="text-white">Peng (碰)</strong></td><td>2 matching</td><td>Anyone</td></tr>
              <tr><td className="py-0.5"><strong className="text-white">Gang (杠)</strong></td><td>3 matching</td><td>Anyone</td></tr>
              <tr><td className="py-0.5"><strong className="text-white">Hu (胡)</strong></td><td>Completes hand</td><td>Anyone</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-400 mb-4"><strong className="text-white">Priority:</strong> Hu &gt; Peng/Gang &gt; Chi</p>

        <hr className="border-slate-600 my-3" />

        {/* Gang */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Gang (杠)</h4>
        <div className="text-sm text-slate-300 space-y-1 mb-4">
          <p>• <strong className="text-white">Concealed:</strong> Draw all 4 yourself → <strong className="text-emerald-400">+2 pts</strong></p>
          <p>• <strong className="text-white">Exposed:</strong> From discard or upgrade Peng → <strong className="text-emerald-400">+1 pt</strong></p>
          <p>• After Gang, draw a replacement tile</p>
          <p>• Concealed Gangs stay face-down (hidden)</p>
        </div>

        <hr className="border-slate-600 my-3" />

        {/* Special Bonuses */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Special Bonuses</h4>
        <div className="text-sm text-slate-300 mb-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="pb-1.5">Bonus</th>
                <th className="pb-1.5">Points</th>
                <th className="pb-1.5">Condition</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="py-0.5 text-white">No Bonus/Gang</td><td className="text-emerald-400">+15</td><td>No bonus tiles &amp; no gangs</td></tr>
              <tr><td className="py-0.5 text-white">Three Golds</td><td className="text-emerald-400">+30</td><td>Hold all 3 → instant win</td></tr>
              <tr><td className="py-0.5 text-white">Robbing the Gold</td><td className="text-emerald-400">+30</td><td>Claim revealed Gold to win</td></tr>
              <tr><td className="py-0.5 text-white">Golden Pair</td><td className="text-emerald-400">+50</td><td>Pair is 2 Gold tiles</td></tr>
              <tr><td className="py-0.5 text-white">All One Suit</td><td className="text-emerald-400">+100</td><td>Entire hand one suit</td></tr>
              <tr><td className="py-0.5 text-white">Self-Draw</td><td className="text-emerald-400">×2</td><td>Win by drawing yourself</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mb-4">Special bonuses trigger ×2 on base, then bonus points added on top.</p>

        <hr className="border-slate-600 my-3" />

        {/* Scoring */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Scoring</h4>
        <div className="text-sm text-slate-400 font-mono bg-slate-900/50 p-3 rounded mb-4 space-y-0.5">
          <p><span className="text-slate-300">Base</span> +1</p>
          <p><span className="text-slate-300">Bonus tiles</span> +1 each</p>
          <p><span className="text-slate-300">Gold tiles</span> +1 each</p>
          <p><span className="text-slate-300">Concealed Gang</span> +2 each</p>
          <p><span className="text-slate-300">Exposed Gang</span> +1 each</p>
          <p><span className="text-slate-300">Dealer streak</span> +N</p>
          <p className="text-slate-600 text-xs pt-1">────────────────</p>
          <p><span className="text-slate-300">Self-draw</span> ×2</p>
          <p><span className="text-slate-300">+ Special bonuses</span></p>
          <p className="text-slate-600 text-xs">────────────────</p>
          <p className="text-white pt-1">All 3 losers pay winner</p>
        </div>

        {/* Other Rules */}
        <h4 className="text-amber-400 font-bold text-base mb-2">Other Rules</h4>
        <div className="text-sm text-slate-300 space-y-1">
          <p>• <strong className="text-white">Dead Wall:</strong> 16 tiles reserved, cannot be drawn</p>
          <p>• <strong className="text-white">Draw Game:</strong> Wall empty, no winner → dealer stays</p>
          <p>• <strong className="text-white">Turn Order:</strong> Counter-clockwise (S→E→N→W)</p>
          <p>• <strong className="text-white">Start:</strong> Dealer gets 17, others 16. Dealer discards first.</p>
          <p>• <strong className="text-white">Winning is optional:</strong> Pass to aim for a higher score</p>
        </div>
      </div>
    </div>
  );
}
