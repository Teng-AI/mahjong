'use client';

import { WinnerInfo } from '@/types';

export interface ScoreBreakdownProps {
  winner: WinnerInfo;
  compact?: boolean;
}

export function ScoreBreakdown({ winner, compact = false }: ScoreBreakdownProps) {
  const { score } = winner;

  return (
    <div className={`space-y-0.5 ${compact ? 'text-sm' : 'text-base space-y-1'}`}>
      <div className="flex justify-between">
        <span className="text-slate-300">Base:</span>
        <span>{score.base}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-300">Bonus tiles:</span>
        <span>+{score.bonusTiles}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-300">Gold tiles:</span>
        <span>+{score.golds}</span>
      </div>
      {score.concealedKongBonus > 0 && (
        <div className="flex justify-between text-pink-400">
          <span>Concealed Gang:</span>
          <span>+{score.concealedKongBonus}</span>
        </div>
      )}
      {score.exposedKongBonus > 0 && (
        <div className="flex justify-between text-pink-300">
          <span>Exposed Gang:</span>
          <span>+{score.exposedKongBonus}</span>
        </div>
      )}
      {score.dealerStreakBonus > 0 && (
        <div className="flex justify-between text-orange-400">
          <span>Dealer streak:</span>
          <span>+{score.dealerStreakBonus}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-600 pt-1">
        <span className="text-slate-300">Subtotal:</span>
        <span>{score.subtotal}</span>
      </div>
      {winner.isSelfDraw && (
        <div className="flex justify-between">
          <span className="text-slate-300">Self-draw:</span>
          <span>×{score.multiplier}</span>
        </div>
      )}
      {winner.isThreeGolds && (
        <div className="flex justify-between text-yellow-400">
          <span>Three Golds bonus:</span>
          <span>+{score.threeGoldsBonus}</span>
        </div>
      )}
      {winner.isRobbingGold && score.robbingGoldBonus && (
        <div className="flex justify-between text-amber-400">
          <span>Robbing Gold bonus:</span>
          <span>+{score.robbingGoldBonus}</span>
        </div>
      )}
      {score.goldenPairBonus && score.goldenPairBonus > 0 && (
        <div className="flex justify-between text-yellow-400">
          <span>Golden Pair bonus:</span>
          <span>+{score.goldenPairBonus}</span>
        </div>
      )}
      {score.noBonusBonus && score.noBonusBonus > 0 && (
        <div className="flex justify-between text-cyan-400">
          <span>No Bonus bonus:</span>
          <span>+{score.noBonusBonus}</span>
        </div>
      )}
      {score.allOneSuitBonus && score.allOneSuitBonus > 0 && (
        <div className="flex justify-between text-pink-400">
          <span>All One Suit bonus:</span>
          <span>+{score.allOneSuitBonus}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-600 pt-1 font-bold text-amber-400">
        <span>Total:</span>
        <span>{score.total}</span>
      </div>
    </div>
  );
}
