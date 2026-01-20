'use client';

import { getTileType, getTileDisplayText, isBonusTile } from '@/lib/tiles';
import { TileId, TileType } from '@/types';

export interface TileProps {
  tileId: TileId;
  goldTileType?: TileType;
  onClick?: () => void;
  selected?: boolean;
  isJustDrawn?: boolean;
  isChowValid?: boolean; // Valid for chow selection
  isChowSelected?: boolean; // Selected for chow
  isFocused?: boolean; // Keyboard focus for chow selection
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean; // Show tile back (for concealed kongs from other players)
}

export function Tile({
  tileId,
  goldTileType,
  onClick,
  selected,
  isJustDrawn,
  isChowValid,
  isChowSelected,
  isFocused,
  disabled,
  size = 'md',
  faceDown = false,
}: TileProps) {
  const tileType = getTileType(tileId);
  const displayText = faceDown ? '🀫' : getTileDisplayText(tileType);
  const isGold = !faceDown && goldTileType && tileType === goldTileType;
  const isBonus = !faceDown && isBonusTile(tileId);

  // Get suit-specific text color
  const getSuitTextColor = () => {
    if (isBonus) return 'text-gray-800'; // Bonus tiles stay black
    if (tileType.startsWith('dots_')) return 'text-red-600';
    if (tileType.startsWith('bamboo_')) return 'text-blue-600';
    if (tileType.startsWith('characters_')) return 'text-green-600';
    return 'text-gray-800'; // Honors (winds/dragons) stay black
  };

  // Responsive tile sizes: smaller on mobile (< 640px)
  const sizeClasses = {
    sm: 'w-7 h-9 text-xs sm:w-9 sm:h-11 sm:text-lg', // Melds, bonus tiles (tighter text on mobile)
    md: 'w-10 h-12 text-xl sm:w-14 sm:h-[72px] sm:text-2xl', // Last action, discarded sections
    lg: 'w-12 h-14 text-2xl sm:w-16 sm:h-20 sm:text-3xl md:w-20 md:h-24 md:text-4xl', // Player's hand
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick || disabled}
      className={`
        ${sizeClasses[size]}
        rounded-md border-2 font-bold
        flex items-center justify-center
        transition-all
        ${faceDown
          ? 'bg-blue-900 border-blue-700 text-blue-300'
          : isGold
            ? 'bg-yellow-100 border-yellow-400'
            : 'bg-white border-gray-300'
        }
        ${!faceDown && getSuitTextColor()}
        ${selected ? 'ring-2 ring-blue-500 -translate-y-2 relative z-10' : ''}
        ${isJustDrawn ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]' : ''}
        ${isChowValid ? 'ring-2 ring-cyan-400' : ''}
        ${isChowSelected ? 'ring-2 ring-green-500 -translate-y-2 bg-green-100 relative z-10' : ''}
        ${isFocused && !isChowSelected ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-800 -translate-y-1 relative z-10' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${onClick && !disabled ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}
      `}
    >
      {displayText}
    </button>
  );
}
