import { TileId, TileType, TileCategory, Suit, WindDirection, ParsedTile } from '@/types';

// ============================================
// TILE GENERATION
// ============================================

/**
 * Generate all 128 tile IDs for a new game
 */
export function generateAllTiles(): TileId[] {
  const tiles: TileId[] = [];

  // Suit tiles (108 total: 3 suits × 9 numbers × 4 copies)
  const suits: Suit[] = ['dots', 'bamboo', 'characters'];
  for (const suit of suits) {
    for (let num = 1; num <= 9; num++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push(`${suit}_${num}_${copy}`);
      }
    }
  }

  // Wind tiles (16 total: 4 directions × 4 copies)
  const winds: WindDirection[] = ['east', 'south', 'west', 'north'];
  for (const wind of winds) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(`wind_${wind}_${copy}`);
    }
  }

  // Red Dragon tiles (4 total: 4 copies of 中)
  for (let copy = 0; copy < 4; copy++) {
    tiles.push(`dragon_red_${copy}`);
  }

  return tiles;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================
// TILE PARSING
// ============================================

/**
 * Get tile type from tile ID (removes instance number)
 * "dots_5_2" -> "dots_5"
 * "wind_east_0" -> "wind_east"
 */
export function getTileType(tileId: TileId): TileType {
  const parts = tileId.split('_');
  if (parts[0] === 'wind' || parts[0] === 'dragon') {
    return `${parts[0]}_${parts[1]}`;
  }
  return `${parts[0]}_${parts[1]}`;
}

/**
 * Parse a tile ID into its components
 */
export function parseTile(tileId: TileId): ParsedTile {
  const parts = tileId.split('_');

  if (parts[0] === 'wind') {
    return {
      category: 'wind',
      value: parts[1] as WindDirection,
      instance: parseInt(parts[2]),
    };
  }

  if (parts[0] === 'dragon') {
    return {
      category: 'dragon',
      value: parts[1], // 'red'
      instance: parseInt(parts[2]),
    };
  }

  return {
    category: 'suit',
    suit: parts[0] as Suit,
    value: parseInt(parts[1]),
    instance: parseInt(parts[2]),
  };
}

/**
 * Parse a tile type (without instance)
 */
export function parseTileType(tileType: TileType): { category: TileCategory; suit?: Suit; value: number | WindDirection | string } {
  const parts = tileType.split('_');

  if (parts[0] === 'wind') {
    return { category: 'wind', value: parts[1] as WindDirection };
  }

  if (parts[0] === 'dragon') {
    return { category: 'dragon', value: parts[1] }; // 'red'
  }

  return {
    category: 'suit',
    suit: parts[0] as Suit,
    value: parseInt(parts[1]),
  };
}

// ============================================
// TILE CHECKS
// ============================================

/**
 * Check if a tile is a suit tile (dots, bamboo, characters)
 */
export function isSuitTile(tileId: TileId): boolean {
  const type = getTileType(tileId);
  return type.startsWith('dots_') || type.startsWith('bamboo_') || type.startsWith('characters_');
}

/**
 * Check if a tile is a bonus tile (wind or dragon)
 */
export function isBonusTile(tileId: TileId): boolean {
  const type = getTileType(tileId);
  return type.startsWith('wind_') || type.startsWith('dragon_');
}

/**
 * Check if a tile is a Gold tile
 */
export function isGoldTile(tileId: TileId, goldTileType: TileType): boolean {
  return getTileType(tileId) === goldTileType;
}

/**
 * Count how many Gold tiles are in a list
 */
export function countGoldTiles(tiles: TileId[], goldTileType: TileType): number {
  return tiles.filter(t => getTileType(t) === goldTileType).length;
}

// ============================================
// TILE MANIPULATION
// ============================================

/**
 * Remove specific tiles from an array (returns new array, or null if tiles not found)
 */
export function removeTiles(tiles: TileId[], toRemove: TileId[]): TileId[] | null {
  const result = [...tiles];

  for (const tile of toRemove) {
    const index = result.indexOf(tile);
    if (index === -1) return null;
    result.splice(index, 1);
  }

  return result;
}

/**
 * Remove tiles by type (not specific ID)
 */
export function removeTilesByType(tiles: TileId[], types: TileType[]): TileId[] | null {
  const result = [...tiles];

  for (const type of types) {
    const index = result.findIndex(t => getTileType(t) === type);
    if (index === -1) return null;
    result.splice(index, 1);
  }

  return result;
}

/**
 * Sort tiles for display (Golds first, then by suit, then by number)
 */
export function sortTilesForDisplay(tiles: TileId[], goldTileType: TileType): TileId[] {
  const suitOrder: Record<string, number> = { dots: 0, bamboo: 1, characters: 2 };
  const windOrder: Record<WindDirection, number> = { east: 0, south: 1, west: 2, north: 3 };

  return [...tiles].sort((a, b) => {
    const aIsGold = isGoldTile(a, goldTileType);
    const bIsGold = isGoldTile(b, goldTileType);

    // Golds first
    if (aIsGold && !bIsGold) return -1;
    if (!aIsGold && bIsGold) return 1;

    const parsedA = parseTile(a);
    const parsedB = parseTile(b);

    // Suits before winds before dragons
    const categoryOrder: Record<string, number> = { suit: 0, wind: 1, dragon: 2 };
    if (categoryOrder[parsedA.category] !== categoryOrder[parsedB.category]) {
      return categoryOrder[parsedA.category] - categoryOrder[parsedB.category];
    }

    // Within same category
    if (parsedA.category === 'suit' && parsedB.category === 'suit') {
      if (parsedA.suit !== parsedB.suit) {
        return suitOrder[parsedA.suit!] - suitOrder[parsedB.suit!];
      }
      return (parsedA.value as number) - (parsedB.value as number);
    }

    if (parsedA.category === 'wind' && parsedB.category === 'wind') {
      return windOrder[parsedA.value as WindDirection] - windOrder[parsedB.value as WindDirection];
    }

    // Dragons are all the same type (red), sort by instance
    if (parsedA.category === 'dragon' && parsedB.category === 'dragon') {
      return parsedA.instance - parsedB.instance;
    }

    return 0;
  });
}

// ============================================
// TILE DISPLAY
// ============================================

/**
 * Get display text for a tile type
 */
export function getTileDisplayText(tileType: TileType): string {
  const { category, suit, value } = parseTileType(tileType);

  if (category === 'wind') {
    const windNames: Record<WindDirection, string> = {
      east: '東', south: '南', west: '西', north: '北'
    };
    return windNames[value as WindDirection];
  }

  if (category === 'dragon') {
    // Red dragon
    return '中';
  }

  // Suit tile
  const suitSymbols: Record<Suit, string> = {
    dots: '●',
    bamboo: '竹',
    characters: '萬'
  };

  return `${value}${suitSymbols[suit!]}`;
}
