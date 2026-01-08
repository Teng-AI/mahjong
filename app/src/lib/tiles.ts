import { TileId, TileType, TileCategory, Suit, WindDirection, ParsedTile, ChowOption, ValidCalls, Meld } from '@/types';

// ============================================
// TILE GENERATION
// ============================================

/**
 * Generate all tiles for Fujian Mahjong
 *
 * TILE COUNTS (128 total):
 * - 108 suited tiles (dots, bamboo, characters × 9 values × 4 copies)
 * - 16 wind tiles (east, south, west, north × 4 copies)
 * - 4 red dragon tiles (中 × 4 copies)
 *
 * NO flowers or seasons in this variant.
 *
 * TILE ID FORMAT: "{type}_{value}_{instance}"
 * Examples: "dots_1_0", "wind_east_2", "dragon_red_3"
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

  // Total: 108 + 16 + 4 = 128 tiles
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

  if (parts[0] === 'flower') {
    return { category: 'bonus', value: `flower_${parts[1]}` };
  }

  if (parts[0] === 'season') {
    return { category: 'bonus', value: `season_${parts[1]}` };
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
// ============================================
// WIN DETECTION
// ============================================

/**
 * Check if tiles can form a winning hand (5 sets + 1 pair)
 * Gold tiles act as wildcards
 *
 * @param tiles - All tiles (concealed + optional discard)
 * @param goldTileType - The Gold tile type
 * @param exposedMeldCount - Number of exposed melds (Pung/Chow already formed)
 */
export function canFormWinningHand(
  tiles: TileId[],
  goldTileType: TileType,
  exposedMeldCount: number = 0
): boolean {
  // To win: 5 sets + 1 pair total
  // With N exposed melds, we need (5-N) sets + 1 pair from concealed tiles
  // No strict tile count check - just verify if tiles can form the required structure
  // This handles varying hand sizes during gameplay and will work with Kong
  const setsNeeded = 5 - exposedMeldCount;

  // Quick sanity check: need at least 2 tiles for pair + 3 per set needed
  const minTilesNeeded = 2 + (3 * setsNeeded);
  if (tiles.length < minTilesNeeded) {
    return false;
  }

  // Separate Gold tiles (wildcards) from regular tiles
  const goldTiles = tiles.filter(t => isGoldTile(t, goldTileType));
  const regularTiles = tiles.filter(t => !isGoldTile(t, goldTileType));

  // Count tiles by type for easier manipulation
  const tileCounts = new Map<TileType, number>();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    tileCounts.set(type, (tileCounts.get(type) || 0) + 1);
  }

  // Try to form winning hand with available wildcards
  return tryFormSetsAndPair(tileCounts, goldTiles.length, false, setsNeeded);
}

/**
 * Try to form the required number of sets and exactly one pair
 * @param hasPair - whether we've already formed the pair
 * @param setsNeeded - number of sets still needed
 */
function tryFormSetsAndPair(
  tileCounts: Map<TileType, number>,
  wildcards: number,
  hasPair: boolean,
  setsNeeded: number
): boolean {
  // Count remaining tiles
  let totalTiles = 0;
  for (const count of tileCounts.values()) {
    totalTiles += count;
  }
  totalTiles += wildcards;

  // Base case: no tiles left and all sets formed
  if (totalTiles === 0 && setsNeeded === 0) {
    return hasPair; // Success only if we formed exactly one pair
  }

  // If only 2 tiles left, no pair yet, and no more sets needed, try to form pair
  if (totalTiles === 2 && !hasPair && setsNeeded === 0) {
    return canFormPair(tileCounts, wildcards);
  }

  // Get all tile types with count > 0 and sort them for consistent processing
  // Sort by suit, then by value to ensure chow detection works properly
  const tilesWithCount: TileType[] = [];
  for (const [type, count] of tileCounts.entries()) {
    if (count > 0) {
      tilesWithCount.push(type);
    }
  }

  // Sort tiles: winds/dragons first, then suits by name, then by number
  tilesWithCount.sort((a, b) => {
    const parsedA = parseTileType(a);
    const parsedB = parseTileType(b);

    // Non-suit before suit (so they get processed first and form pairs/pungs)
    if (parsedA.category !== 'suit' && parsedB.category === 'suit') return -1;
    if (parsedA.category === 'suit' && parsedB.category !== 'suit') return 1;

    // Within suits, sort by suit name then value
    if (parsedA.category === 'suit' && parsedB.category === 'suit') {
      if (parsedA.suit !== parsedB.suit) {
        return (parsedA.suit || '').localeCompare(parsedB.suit || '');
      }
      return (parsedA.value as number) - (parsedB.value as number);
    }

    return 0;
  });

  // Find first non-zero tile type (now sorted)
  const firstType: TileType | null = tilesWithCount.length > 0 ? tilesWithCount[0] : null;

  // If no regular tiles, use wildcards
  if (firstType === null) {
    if (wildcards >= 3 && setsNeeded > 0) {
      // Form a set with 3 wildcards
      return tryFormSetsAndPair(new Map(tileCounts), wildcards - 3, hasPair, setsNeeded - 1);
    } else if (wildcards === 2 && !hasPair && setsNeeded === 0) {
      // Form a pair with 2 wildcards
      return true;
    }
    return false;
  }

  const parsed = parseTileType(firstType);
  const count = tileCounts.get(firstType) || 0;

  // Try forming a pair with this tile (if no pair yet)
  if (!hasPair && count >= 2) {
    const newCounts = new Map(tileCounts);
    newCounts.set(firstType, count - 2);
    if (tryFormSetsAndPair(newCounts, wildcards, true, setsNeeded)) {
      return true;
    }
  }

  // Try forming a pair with 1 tile + 1 wildcard
  if (!hasPair && count >= 1 && wildcards >= 1) {
    const newCounts = new Map(tileCounts);
    newCounts.set(firstType, count - 1);
    if (tryFormSetsAndPair(newCounts, wildcards - 1, true, setsNeeded)) {
      return true;
    }
  }

  // Try forming a Pung (triplet) with this tile
  if (count >= 3 && setsNeeded > 0) {
    const newCounts = new Map(tileCounts);
    newCounts.set(firstType, count - 3);
    if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) {
      return true;
    }
  }

  // Try forming a Pung with wildcards (2 tiles + 1 wildcard)
  if (count >= 2 && wildcards >= 1 && setsNeeded > 0) {
    const newCounts = new Map(tileCounts);
    newCounts.set(firstType, count - 2);
    if (tryFormSetsAndPair(newCounts, wildcards - 1, hasPair, setsNeeded - 1)) {
      return true;
    }
  }

  // Try forming a Pung with wildcards (1 tile + 2 wildcards)
  if (count >= 1 && wildcards >= 2 && setsNeeded > 0) {
    const newCounts = new Map(tileCounts);
    newCounts.set(firstType, count - 1);
    if (tryFormSetsAndPair(newCounts, wildcards - 2, hasPair, setsNeeded - 1)) {
      return true;
    }
  }

  // Try forming a Chow (sequence) - only for suit tiles
  if (parsed.category === 'suit' && typeof parsed.value === 'number' && parsed.value <= 7 && setsNeeded > 0) {
    const suit = parsed.suit!;
    const val = parsed.value;
    const type2 = `${suit}_${val + 1}` as TileType;
    const type3 = `${suit}_${val + 2}` as TileType;
    const count2 = tileCounts.get(type2) || 0;
    const count3 = tileCounts.get(type3) || 0;

    // Try full chow (all 3 tiles present)
    if (count >= 1 && count2 >= 1 && count3 >= 1) {
      const newCounts = new Map(tileCounts);
      newCounts.set(firstType, count - 1);
      newCounts.set(type2, count2 - 1);
      newCounts.set(type3, count3 - 1);
      if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) {
        return true;
      }
    }

    // Try chow with 1 wildcard (missing one tile)
    if (wildcards >= 1) {
      // Missing tile 3
      if (count >= 1 && count2 >= 1) {
        const newCounts = new Map(tileCounts);
        newCounts.set(firstType, count - 1);
        newCounts.set(type2, count2 - 1);
        if (tryFormSetsAndPair(newCounts, wildcards - 1, hasPair, setsNeeded - 1)) {
          return true;
        }
      }
      // Missing tile 2
      if (count >= 1 && count3 >= 1) {
        const newCounts = new Map(tileCounts);
        newCounts.set(firstType, count - 1);
        newCounts.set(type3, count3 - 1);
        if (tryFormSetsAndPair(newCounts, wildcards - 1, hasPair, setsNeeded - 1)) {
          return true;
        }
      }
    }

    // Try chow with 2 wildcards (only have first tile)
    if (wildcards >= 2 && count >= 1) {
      const newCounts = new Map(tileCounts);
      newCounts.set(firstType, count - 1);
      if (tryFormSetsAndPair(newCounts, wildcards - 2, hasPair, setsNeeded - 1)) {
        return true;
      }
    }

  }

  // Try chow with wildcard as FIRST tile - separate block because firstType can be 2-9
  // (The block above only handles firstType 1-7 for starting a chow)
  if (parsed.category === 'suit' && typeof parsed.value === 'number' && setsNeeded > 0) {
    const suit = parsed.suit!;
    const val = parsed.value;

    // Try chow with wildcard as FIRST tile (wildcard + firstType + nextType)
    // This handles cases like Gold(7) + 8 + 9 where firstType is 8
    if (wildcards >= 1 && val >= 2 && val <= 8) {
      const nextType = `${suit}_${val + 1}` as TileType;
      const nextCount = tileCounts.get(nextType) || 0;

      if (count >= 1 && nextCount >= 1) {
        const newCounts = new Map(tileCounts);
        newCounts.set(firstType, count - 1);
        newCounts.set(nextType, nextCount - 1);
        if (tryFormSetsAndPair(newCounts, wildcards - 1, hasPair, setsNeeded - 1)) {
          return true;
        }
      }
    }

    // Try chow with wildcard as first tile AND wildcard as second (wildcard + wildcard + firstType)
    // This handles cases like Gold(7) + Gold(8) + 9 where firstType is 9
    if (wildcards >= 2 && val >= 3) {
      const newCounts = new Map(tileCounts);
      newCounts.set(firstType, count - 1);
      if (tryFormSetsAndPair(newCounts, wildcards - 2, hasPair, setsNeeded - 1)) {
        return true;
      }
    }

    // Try chow with wildcard as first tile AND wildcard as third (wildcard + firstType + wildcard)
    // This handles cases like Gold(7) + 8 + Gold(10) where firstType is 8
    if (wildcards >= 2 && val >= 2 && val <= 8) {
      const newCounts = new Map(tileCounts);
      newCounts.set(firstType, count - 1);
      if (tryFormSetsAndPair(newCounts, wildcards - 2, hasPair, setsNeeded - 1)) {
        return true;
      }
    }
  }

  // If we can't use this tile in any set, the hand is not valid
  // (This handles cases where we have orphan tiles)
  return false;
}

/**
 * Check if remaining tiles can form a pair
 */
function canFormPair(tileCounts: Map<TileType, number>, wildcards: number): boolean {
  // Count remaining regular tiles
  let totalRegular = 0;
  for (const count of tileCounts.values()) {
    totalRegular += count;
  }

  // 2 regular tiles of same type
  for (const count of tileCounts.values()) {
    if (count >= 2) return true;
  }

  // 1 regular + 1 wildcard
  if (totalRegular >= 1 && wildcards >= 1) return true;

  // 2 wildcards
  if (wildcards >= 2) return true;

  return false;
}

/**
 * Get all possible winning tile types for a hand (for tenpai detection)
 * Returns empty array if hand cannot win with any tile
 */
export function getWinningTiles(tiles: TileId[], goldTileType: TileType): TileType[] {
  if (tiles.length !== 16) {
    return [];
  }

  const winningTypes: TileType[] = [];

  // Try adding each possible tile type
  const allTypes = getAllSuitTileTypes();

  for (const type of allTypes) {
    // Create a fake tile of this type
    const fakeTile = `${type}_0` as TileId;
    const testHand = [...tiles, fakeTile];

    if (canFormWinningHand(testHand, goldTileType)) {
      winningTypes.push(type);
    }
  }

  return winningTypes;
}

/**
 * Get all suit tile types (for testing winning tiles)
 */
function getAllSuitTileTypes(): TileType[] {
  const types: TileType[] = [];
  const suits = ['dots', 'bamboo', 'characters'];

  for (const suit of suits) {
    for (let num = 1; num <= 9; num++) {
      types.push(`${suit}_${num}` as TileType);
    }
  }

  return types;
}

// ============================================
// CALLING VALIDATION
// ============================================

/**
 * Check if a player can call Pung on a discarded tile
 * Requires exactly 2 tiles of the same type in hand
 * Gold tiles CANNOT be used in calls - neither the discard nor tiles from hand
 */
export function canPung(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): boolean {
  // Gold tiles cannot be called
  if (isGoldTile(discardTile, goldTileType)) {
    return false;
  }

  // Note: No hand size check - you can call as long as you have the tiles
  // This allows flexibility for Kong (which affects hand size) and edge cases

  const discardType = getTileType(discardTile);
  let matchCount = 0;

  for (const tile of hand) {
    // Don't count Gold tiles - they cannot be used in calls
    if (isGoldTile(tile, goldTileType)) {
      continue;
    }
    if (getTileType(tile) === discardType) {
      matchCount++;
    }
  }

  return matchCount >= 2;
}

/**
 * Check if a player can call Chow on a discarded tile
 * Returns all valid chow options (there may be multiple)
 *
 * Rules:
 * - Only suit tiles can form chows (no winds/dragons)
 * - Gold tiles CANNOT be used in calls - neither the discard nor tiles from hand
 * - Must have 2 tiles in hand that form a sequence with the discard
 * - Three possible positions: discard is low/mid/high of sequence
 */
export function canChow(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): ChowOption[] {
  const options: ChowOption[] = [];

  // Gold tiles cannot be called
  if (isGoldTile(discardTile, goldTileType)) {
    return [];
  }

  // Note: No hand size check - you can call as long as you have the tiles
  // This allows flexibility for Kong (which affects hand size) and edge cases

  const parsed = parseTile(discardTile);

  // Only suit tiles can form chows
  if (parsed.category !== 'suit' || typeof parsed.value !== 'number') {
    return [];
  }

  const suit = parsed.suit!;
  const val = parsed.value;

  // Group hand tiles by type for easier lookup (exclude Gold tiles - they cannot be used in calls)
  const handByType = new Map<TileType, TileId[]>();
  for (const tile of hand) {
    // Skip Gold tiles - they cannot be used in calls
    if (isGoldTile(tile, goldTileType)) {
      continue;
    }
    const type = getTileType(tile);
    if (!handByType.has(type)) {
      handByType.set(type, []);
    }
    handByType.get(type)!.push(tile);
  }

  // Check three possible sequence positions
  // 1. Discard is LOW: need val+1 and val+2 from hand
  if (val <= 7) {
    const type1 = `${suit}_${val + 1}` as TileType;
    const type2 = `${suit}_${val + 2}` as TileType;
    const tiles1 = handByType.get(type1) || [];
    const tiles2 = handByType.get(type2) || [];

    if (tiles1.length > 0 && tiles2.length > 0) {
      options.push({
        tilesFromHand: [tiles1[0], tiles2[0]],
        sequence: [getTileType(discardTile), type1, type2],
      });
    }
  }

  // 2. Discard is MIDDLE: need val-1 and val+1 from hand
  if (val >= 2 && val <= 8) {
    const type1 = `${suit}_${val - 1}` as TileType;
    const type2 = `${suit}_${val + 1}` as TileType;
    const tiles1 = handByType.get(type1) || [];
    const tiles2 = handByType.get(type2) || [];

    if (tiles1.length > 0 && tiles2.length > 0) {
      options.push({
        tilesFromHand: [tiles1[0], tiles2[0]],
        sequence: [type1, getTileType(discardTile), type2],
      });
    }
  }

  // 3. Discard is HIGH: need val-2 and val-1 from hand
  if (val >= 3) {
    const type1 = `${suit}_${val - 2}` as TileType;
    const type2 = `${suit}_${val - 1}` as TileType;
    const tiles1 = handByType.get(type1) || [];
    const tiles2 = handByType.get(type2) || [];

    if (tiles1.length > 0 && tiles2.length > 0) {
      options.push({
        tilesFromHand: [tiles1[0], tiles2[0]],
        sequence: [type1, type2, getTileType(discardTile)],
      });
    }
  }

  return options;
}

/**
 * Check if chow is possible at all (boolean version for quick check)
 */
export function hasChowOption(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): boolean {
  return canChow(hand, discardTile, goldTileType, exposedMeldCount).length > 0;
}

/**
 * Check if a player can win on a discarded tile
 * @param exposedMeldCount - Number of exposed melds the player has
 */
export function canWinOnDiscard(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): boolean {
  // Just check if hand + discard can form a winning hand
  // No hand size check - let canFormWinningHand validate the structure
  const testHand = [...hand, discardTile];
  return canFormWinningHand(testHand, goldTileType, exposedMeldCount);
}

/**
 * Get all valid call options for a player on a discarded tile
 * @param isNextInTurn - Only next-in-turn player can Chow
 * @param exposedMeldCount - Number of exposed melds the player has
 */
export function getValidCalls(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  isNextInTurn: boolean,
  exposedMeldCount: number = 0
): ValidCalls {
  return {
    canWin: canWinOnDiscard(hand, discardTile, goldTileType, exposedMeldCount),
    canPung: canPung(hand, discardTile, goldTileType, exposedMeldCount),
    canChow: isNextInTurn && hasChowOption(hand, discardTile, goldTileType, exposedMeldCount),
  };
}

/**
 * Get valid tiles for chow selection UI
 * Returns a Map where key = first tile that can be selected,
 * value = array of valid second tiles to pair with it
 *
 * This helps the UI highlight which tiles can be selected for chow
 */
export function getValidChowTiles(
  hand: TileId[],
  discardTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): Map<TileId, TileId[]> {
  const validPairs = new Map<TileId, TileId[]>();

  // Get all chow options
  const options = canChow(hand, discardTile, goldTileType, exposedMeldCount);

  for (const option of options) {
    const [tile1, tile2] = option.tilesFromHand;

    // Add tile1 -> tile2 mapping
    if (!validPairs.has(tile1)) {
      validPairs.set(tile1, []);
    }
    if (!validPairs.get(tile1)!.includes(tile2)) {
      validPairs.get(tile1)!.push(tile2);
    }

    // Add tile2 -> tile1 mapping (can select in either order)
    if (!validPairs.has(tile2)) {
      validPairs.set(tile2, []);
    }
    if (!validPairs.get(tile2)!.includes(tile1)) {
      validPairs.get(tile2)!.push(tile1);
    }
  }

  return validPairs;
}

/**
 * Validate that two selected tiles can form a chow with the discard
 * Returns the ChowOption if valid, null otherwise
 */
export function validateChowSelection(
  hand: TileId[],
  discardTile: TileId,
  selectedTiles: [TileId, TileId],
  goldTileType: TileType,
  exposedMeldCount: number = 0
): ChowOption | null {
  const options = canChow(hand, discardTile, goldTileType, exposedMeldCount);

  for (const option of options) {
    const [t1, t2] = option.tilesFromHand;
    const [s1, s2] = selectedTiles;

    // Check if selected tiles match this option (in either order)
    if ((t1 === s1 && t2 === s2) || (t1 === s2 && t2 === s1)) {
      return option;
    }
  }

  return null;
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

  if (category === 'bonus') {
    // Flower and season tiles
    const bonusNames: Record<string, string> = {
      'flower_1': '🌸', 'flower_2': '🌺', 'flower_3': '🌷', 'flower_4': '🌻',
      'season_1': '🌱', 'season_2': '☀️', 'season_3': '🍂', 'season_4': '❄️',
    };
    return bonusNames[value as string] || '🎴';
  }

  // Suit tile
  const suitSymbols: Record<Suit, string> = {
    dots: '●',
    bamboo: '║',
    characters: '萬'
  };

  return `${value}${suitSymbols[suit!]}`;
}
