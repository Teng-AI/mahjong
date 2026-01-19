import {
  generateAllTiles,
  getTileType,
  parseTile,
  isSuitTile,
  isBonusTile,
  isGoldTile,
  countGoldTiles,
  canFormWinningHand,
  canPung,
  canChow,
  canWinOnDiscard,
  hasGoldenPair,
  removeTiles,
  sortTilesForDisplay,
  canKong,
  canDeclareConcealedKong,
  canUpgradePungToKong,
} from '@/lib/tiles';
import { TileId, TileType, Meld } from '@/types';

// ============================================
// TILE GENERATION TESTS
// ============================================

describe('generateAllTiles', () => {
  it('should generate exactly 128 tiles', () => {
    const tiles = generateAllTiles();
    expect(tiles.length).toBe(128);
  });

  it('should generate 108 suit tiles', () => {
    const tiles = generateAllTiles();
    const suitTiles = tiles.filter(t => isSuitTile(t));
    expect(suitTiles.length).toBe(108);
  });

  it('should generate 16 wind tiles', () => {
    const tiles = generateAllTiles();
    const windTiles = tiles.filter(t => getTileType(t).startsWith('wind_'));
    expect(windTiles.length).toBe(16);
  });

  it('should generate 4 dragon tiles', () => {
    const tiles = generateAllTiles();
    const dragonTiles = tiles.filter(t => getTileType(t).startsWith('dragon_'));
    expect(dragonTiles.length).toBe(4);
  });

  it('should generate 4 copies of each tile type', () => {
    const tiles = generateAllTiles();
    const typeCounts = new Map<TileType, number>();

    for (const tile of tiles) {
      const type = getTileType(tile);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    // Check that each type has exactly 4 copies
    for (const count of typeCounts.values()) {
      expect(count).toBe(4);
    }
  });
});

// ============================================
// TILE PARSING TESTS
// ============================================

describe('getTileType', () => {
  it('should extract type from suit tile', () => {
    expect(getTileType('dots_5_2')).toBe('dots_5');
    expect(getTileType('bamboo_1_0')).toBe('bamboo_1');
    expect(getTileType('characters_9_3')).toBe('characters_9');
  });

  it('should extract type from wind tile', () => {
    expect(getTileType('wind_east_0')).toBe('wind_east');
    expect(getTileType('wind_south_2')).toBe('wind_south');
  });

  it('should extract type from dragon tile', () => {
    expect(getTileType('dragon_red_0')).toBe('dragon_red');
    expect(getTileType('dragon_red_3')).toBe('dragon_red');
  });
});

describe('parseTile', () => {
  it('should parse suit tiles correctly', () => {
    const parsed = parseTile('dots_5_2');
    expect(parsed.category).toBe('suit');
    expect(parsed.suit).toBe('dots');
    expect(parsed.value).toBe(5);
    expect(parsed.instance).toBe(2);
  });

  it('should parse wind tiles correctly', () => {
    const parsed = parseTile('wind_east_0');
    expect(parsed.category).toBe('wind');
    expect(parsed.value).toBe('east');
    expect(parsed.instance).toBe(0);
  });

  it('should parse dragon tiles correctly', () => {
    const parsed = parseTile('dragon_red_1');
    expect(parsed.category).toBe('dragon');
    expect(parsed.value).toBe('red');
    expect(parsed.instance).toBe(1);
  });
});

// ============================================
// TILE CHECKS TESTS
// ============================================

describe('isSuitTile', () => {
  it('should return true for suit tiles', () => {
    expect(isSuitTile('dots_5_0')).toBe(true);
    expect(isSuitTile('bamboo_1_2')).toBe(true);
    expect(isSuitTile('characters_9_3')).toBe(true);
  });

  it('should return false for non-suit tiles', () => {
    expect(isSuitTile('wind_east_0')).toBe(false);
    expect(isSuitTile('dragon_red_0')).toBe(false);
  });
});

describe('isBonusTile', () => {
  it('should return true for wind and dragon tiles', () => {
    expect(isBonusTile('wind_east_0')).toBe(true);
    expect(isBonusTile('wind_south_1')).toBe(true);
    expect(isBonusTile('dragon_red_0')).toBe(true);
  });

  it('should return false for suit tiles', () => {
    expect(isBonusTile('dots_5_0')).toBe(false);
    expect(isBonusTile('bamboo_1_2')).toBe(false);
  });
});

describe('isGoldTile', () => {
  it('should identify gold tiles correctly', () => {
    const goldType: TileType = 'dots_5';
    expect(isGoldTile('dots_5_0', goldType)).toBe(true);
    expect(isGoldTile('dots_5_3', goldType)).toBe(true);
    expect(isGoldTile('dots_6_0', goldType)).toBe(false);
    expect(isGoldTile('bamboo_5_0', goldType)).toBe(false);
  });
});

describe('countGoldTiles', () => {
  it('should count gold tiles correctly', () => {
    const goldType: TileType = 'dots_5';
    const tiles: TileId[] = ['dots_5_0', 'dots_5_1', 'dots_6_0', 'bamboo_1_0'];
    expect(countGoldTiles(tiles, goldType)).toBe(2);
  });

  it('should return 0 when no gold tiles present', () => {
    const goldType: TileType = 'dots_5';
    const tiles: TileId[] = ['dots_1_0', 'dots_2_0', 'dots_3_0'];
    expect(countGoldTiles(tiles, goldType)).toBe(0);
  });
});

// ============================================
// WIN DETECTION TESTS
// ============================================

describe('canFormWinningHand', () => {
  const goldType: TileType = 'dots_5';

  it('should detect basic winning hand (5 pungs + 1 pair)', () => {
    // 5 triplets + 1 pair = 17 tiles
    const hand: TileId[] = [
      // Pung 1: dots_1
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      // Pung 2: dots_2
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      // Pung 3: dots_3
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      // Pung 4: bamboo_1
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      // Pung 5: bamboo_2
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Pair: characters_9
      'characters_9_0', 'characters_9_1',
    ];
    expect(canFormWinningHand(hand, goldType)).toBe(true);
  });

  it('should detect winning hand with chows', () => {
    // 3 chows + 2 pungs + 1 pair = 17 tiles
    const hand: TileId[] = [
      // Chow 1: dots 1-2-3
      'dots_1_0', 'dots_2_0', 'dots_3_0',
      // Chow 2: dots 4-5-6
      'dots_4_0', 'dots_5_0', 'dots_6_0',
      // Chow 3: dots 7-8-9
      'dots_7_0', 'dots_8_0', 'dots_9_0',
      // Pung 1: bamboo_1
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      // Pung 2: bamboo_2
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Pair: characters_9
      'characters_9_0', 'characters_9_1',
    ];
    expect(canFormWinningHand(hand, goldType)).toBe(true);
  });

  it('should detect winning hand with gold tiles as wildcards', () => {
    // Gold (dots_5) acting as wildcard
    const hand: TileId[] = [
      // Pung using gold: dots_1 + gold
      'dots_1_0', 'dots_1_1', 'dots_5_0', // Gold substitutes for dots_1_2
      // Pung 2: dots_2
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      // Pung 3: dots_3
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      // Pung 4: bamboo_1
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      // Pung 5: bamboo_2
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Pair: characters_9
      'characters_9_0', 'characters_9_1',
    ];
    expect(canFormWinningHand(hand, goldType)).toBe(true);
  });

  it('should reject non-winning hand', () => {
    // Random tiles that cannot form winning hand
    const hand: TileId[] = [
      'dots_1_0', 'dots_3_0', 'dots_6_0',
      'bamboo_2_0', 'bamboo_4_0', 'bamboo_7_0',
      'characters_1_0', 'characters_3_0', 'characters_5_0',
      'characters_7_0', 'characters_9_0',
      'wind_east_0', 'wind_south_0',
      'wind_west_0', 'wind_north_0',
      'dragon_red_0', 'dragon_red_1',
    ];
    expect(canFormWinningHand(hand, goldType)).toBe(false);
  });

  it('should account for exposed melds', () => {
    // With 2 exposed melds, need 3 sets + pair from concealed (11 tiles)
    const hand: TileId[] = [
      // Pung 1: dots_1
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      // Pung 2: dots_2
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      // Pung 3: dots_3
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      // Pair: characters_9
      'characters_9_0', 'characters_9_1',
    ];
    expect(canFormWinningHand(hand, goldType, 2)).toBe(true);
  });
});

describe('hasGoldenPair', () => {
  const goldType: TileType = 'dots_5';

  it('should detect golden pair when 2 golds form the pair', () => {
    // 5 sets from regular tiles + 2 golds as pair
    const hand: TileId[] = [
      // Pung 1-5 from regular tiles
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Golden pair
      'dots_5_0', 'dots_5_1',
    ];
    expect(hasGoldenPair(hand, goldType)).toBe(true);
  });

  it('should return false when gold is used as wildcard, not pair', () => {
    // 2 golds used to complete sets, not as pair
    const hand: TileId[] = [
      // 2 golds used in sets
      'dots_1_0', 'dots_1_1', 'dots_5_0', // gold in pung
      'dots_2_0', 'dots_2_1', 'dots_5_1', // gold in pung
      // Regular sets
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Regular pair
      'characters_9_0', 'characters_9_1',
    ];
    expect(hasGoldenPair(hand, goldType)).toBe(false);
  });

  it('should detect golden pair with high-value chows (7-8-9)', () => {
    // This tests a bug where tiles with value 8 or 9 could cause false negatives
    // if they happened to be first in the Map (due to insertion order)
    const goldType7: TileType = 'characters_7';
    const hand: TileId[] = [
      // Chow 7-8-9 in dots (put 9 first to test the bug)
      'dots_9_0', 'dots_8_0', 'dots_7_0',
      // Chow 7-8-9 in bamboo
      'bamboo_9_0', 'bamboo_8_0', 'bamboo_7_0',
      // Chow 1-2-3 in dots
      'dots_1_0', 'dots_2_0', 'dots_3_0',
      // Chow 4-5-6 in dots
      'dots_4_0', 'dots_5_0', 'dots_6_0',
      // Pung of characters_1
      'characters_1_0', 'characters_1_1', 'characters_1_2',
      // Golden pair (2 gold tiles - characters_7)
      'characters_7_0', 'characters_7_1',
    ];
    expect(hasGoldenPair(hand, goldType7)).toBe(true);
  });

  it('should detect golden pair with exposed melds', () => {
    // With 2 exposed melds, only need 3 sets from concealed hand
    const hand: TileId[] = [
      // 3 sets (9 tiles)
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      // Golden pair
      'dots_5_0', 'dots_5_1',
    ];
    expect(hasGoldenPair(hand, goldType, 2)).toBe(true);
  });
});

// ============================================
// CALLING VALIDATION TESTS
// ============================================

describe('canPung', () => {
  const goldType: TileType = 'dots_5';

  it('should return true when player has 2 matching tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'dots_1_1', 'dots_2_0'];
    const discard: TileId = 'dots_1_2';
    expect(canPung(hand, discard, goldType)).toBe(true);
  });

  it('should return false when player has only 1 matching tile', () => {
    const hand: TileId[] = ['dots_1_0', 'dots_2_0', 'dots_3_0'];
    const discard: TileId = 'dots_1_1';
    expect(canPung(hand, discard, goldType)).toBe(false);
  });

  it('should return false when discard is a gold tile', () => {
    const hand: TileId[] = ['dots_5_0', 'dots_5_1', 'dots_2_0'];
    const discard: TileId = 'dots_5_2';
    expect(canPung(hand, discard, goldType)).toBe(false);
  });

  it('should not count gold tiles in hand for pung', () => {
    // Hand has 1 regular dots_1 and 1 gold (dots_5)
    // Gold cannot be used in calls
    const hand: TileId[] = ['dots_1_0', 'dots_5_0', 'dots_2_0'];
    const discard: TileId = 'dots_1_1';
    expect(canPung(hand, discard, goldType)).toBe(false);
  });
});

describe('canChow', () => {
  const goldType: TileType = 'dots_5';

  it('should return options when sequence can be formed', () => {
    const hand: TileId[] = ['dots_2_0', 'dots_3_0', 'dots_6_0'];
    const discard: TileId = 'dots_1_0';
    const options = canChow(hand, discard, goldType);

    expect(options.length).toBe(1);
    expect(options[0].sequence).toEqual(['dots_1', 'dots_2', 'dots_3']);
  });

  it('should return multiple options when multiple sequences possible', () => {
    // Using goldType 'dots_5', so avoid 5 in hand
    const hand: TileId[] = ['dots_1_0', 'dots_2_0', 'dots_4_0', 'dots_6_0'];
    const discard: TileId = 'dots_3_0';
    const options = canChow(hand, discard, goldType);

    // Can form 1-2-3, 2-3-4 (can't form 3-4-5 because 5 is gold)
    expect(options.length).toBe(2);
  });

  it('should return empty when discard is wind/dragon', () => {
    const hand: TileId[] = ['wind_east_0', 'wind_south_0', 'wind_west_0'];
    const discard: TileId = 'wind_north_0';
    expect(canChow(hand, discard, goldType)).toHaveLength(0);
  });

  it('should return empty when discard is gold tile', () => {
    const hand: TileId[] = ['dots_4_0', 'dots_6_0', 'dots_7_0'];
    const discard: TileId = 'dots_5_0'; // gold
    expect(canChow(hand, discard, goldType)).toHaveLength(0);
  });
});

describe('canWinOnDiscard', () => {
  const goldType: TileType = 'dots_5';

  it('should return true when discard completes winning hand', () => {
    // Hand missing one tile for pair
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0', // need characters_9 for pair
    ];
    const discard: TileId = 'characters_9_1';
    expect(canWinOnDiscard(hand, discard, goldType)).toBe(true);
  });

  it('should return false when discard does not complete winning hand', () => {
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0',
    ];
    const discard: TileId = 'characters_8_0'; // wrong tile
    expect(canWinOnDiscard(hand, discard, goldType)).toBe(false);
  });
});

// ============================================
// TILE MANIPULATION TESTS
// ============================================

describe('removeTiles', () => {
  it('should remove specified tiles', () => {
    const tiles: TileId[] = ['dots_1_0', 'dots_2_0', 'dots_3_0'];
    const result = removeTiles(tiles, ['dots_2_0']);

    expect(result).toEqual(['dots_1_0', 'dots_3_0']);
  });

  it('should return null when tile not found', () => {
    const tiles: TileId[] = ['dots_1_0', 'dots_2_0'];
    const result = removeTiles(tiles, ['dots_5_0']);

    expect(result).toBeNull();
  });

  it('should not modify original array', () => {
    const tiles: TileId[] = ['dots_1_0', 'dots_2_0', 'dots_3_0'];
    removeTiles(tiles, ['dots_2_0']);

    expect(tiles.length).toBe(3);
  });
});

describe('sortTilesForDisplay', () => {
  const goldType: TileType = 'dots_5';

  it('should put gold tiles first', () => {
    const tiles: TileId[] = ['dots_1_0', 'dots_5_0', 'bamboo_1_0'];
    const sorted = sortTilesForDisplay(tiles, goldType);

    expect(getTileType(sorted[0])).toBe('dots_5');
  });

  it('should sort suit tiles by suit then value', () => {
    const tiles: TileId[] = ['bamboo_5_0', 'dots_1_0', 'characters_3_0'];
    const sorted = sortTilesForDisplay(tiles, goldType);

    // Order: dots, bamboo, characters
    expect(getTileType(sorted[0])).toBe('dots_1');
    expect(getTileType(sorted[1])).toBe('bamboo_5');
    expect(getTileType(sorted[2])).toBe('characters_3');
  });

  it('should put winds after suits', () => {
    const tiles: TileId[] = ['wind_east_0', 'dots_1_0'];
    const sorted = sortTilesForDisplay(tiles, goldType);

    expect(getTileType(sorted[0])).toBe('dots_1');
    expect(getTileType(sorted[1])).toBe('wind_east');
  });
});

// ============================================
// KONG VALIDATION TESTS
// ============================================

describe('canKong', () => {
  const goldType: TileType = 'dots_5';

  it('should return true when player has 3 matching tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_2_0'];
    const discard: TileId = 'dots_1_3';
    expect(canKong(hand, discard, goldType)).toBe(true);
  });

  it('should return false when player has only 2 matching tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'dots_1_1', 'dots_2_0', 'dots_3_0'];
    const discard: TileId = 'dots_1_2';
    expect(canKong(hand, discard, goldType)).toBe(false);
  });

  it('should return false when discard is a gold tile', () => {
    const hand: TileId[] = ['dots_5_0', 'dots_5_1', 'dots_5_2', 'dots_2_0'];
    const discard: TileId = 'dots_5_3';
    expect(canKong(hand, discard, goldType)).toBe(false);
  });

  it('should not count gold tiles in hand for kong', () => {
    // Hand has 2 regular dots_1 and 1 gold (dots_5)
    // Gold cannot be used in calls
    const hand: TileId[] = ['dots_1_0', 'dots_1_1', 'dots_5_0', 'dots_2_0'];
    const discard: TileId = 'dots_1_2';
    expect(canKong(hand, discard, goldType)).toBe(false);
  });

  it('should not allow kong of bonus tiles (winds/dragons)', () => {
    // Bonus tiles are exposed at game start - they can't form melds
    const hand: TileId[] = ['wind_east_0', 'wind_east_1', 'wind_east_2', 'dots_1_0'];
    const discard: TileId = 'wind_east_3';
    expect(canKong(hand, discard, goldType)).toBe(false);
  });
});

describe('canDeclareConcealedKong', () => {
  const goldType: TileType = 'dots_5';

  it('should return tile type when player has 4 identical tiles', () => {
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_1_3',
      'dots_2_0', 'dots_3_0',
    ];
    const result = canDeclareConcealedKong(hand, goldType);
    expect(result).toContain('dots_1');
    expect(result.length).toBe(1);
  });

  it('should return multiple types when player has multiple sets of 4', () => {
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_1_3',
      'dots_2_0', 'dots_2_1', 'dots_2_2', 'dots_2_3',
    ];
    const result = canDeclareConcealedKong(hand, goldType);
    expect(result).toContain('dots_1');
    expect(result).toContain('dots_2');
    expect(result.length).toBe(2);
  });

  it('should return empty array when no 4-of-a-kind', () => {
    const hand: TileId[] = ['dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_2_0'];
    const result = canDeclareConcealedKong(hand, goldType);
    expect(result).toEqual([]);
  });

  it('should not allow kong of gold tiles', () => {
    const hand: TileId[] = [
      'dots_5_0', 'dots_5_1', 'dots_5_2', 'dots_5_3', // 4 gold tiles
      'dots_1_0',
    ];
    const result = canDeclareConcealedKong(hand, goldType);
    expect(result).toEqual([]);
  });

  it('should not allow kong of bonus tiles (winds/dragons)', () => {
    // Bonus tiles are exposed at game start - they can't form melds
    const hand: TileId[] = [
      'wind_east_0', 'wind_east_1', 'wind_east_2', 'wind_east_3',
      'dots_1_0',
    ];
    const result = canDeclareConcealedKong(hand, goldType);
    expect(result).not.toContain('wind_east');
    expect(result).toEqual([]);
  });
});

describe('canUpgradePungToKong', () => {
  const goldType: TileType = 'dots_5';

  it('should return meld index and tile when upgrade is possible', () => {
    const hand: TileId[] = ['dots_1_3', 'dots_2_0', 'dots_3_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'pung',
        tiles: ['dots_1_0', 'dots_1_1', 'dots_1_2'],
        calledTile: 'dots_1_2',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(1);
    expect(result[0].meldIndex).toBe(0);
    expect(result[0].tileFromHand).toBe('dots_1_3');
  });

  it('should return empty array when no matching tile in hand', () => {
    const hand: TileId[] = ['dots_2_0', 'dots_3_0', 'dots_4_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'pung',
        tiles: ['dots_1_0', 'dots_1_1', 'dots_1_2'],
        calledTile: 'dots_1_2',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(0);
  });

  it('should return empty array when meld is a chow (not pung)', () => {
    const hand: TileId[] = ['dots_1_3', 'dots_2_0', 'dots_3_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'chow',
        tiles: ['dots_1_0', 'dots_2_0', 'dots_3_0'],
        calledTile: 'dots_1_0',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(0);
  });

  it('should return empty array when meld is already a kong', () => {
    const hand: TileId[] = ['dots_1_3', 'dots_2_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'kong',
        tiles: ['dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_1_3'],
        calledTile: 'dots_1_3',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(0);
  });

  it('should not allow upgrade with gold tile from hand', () => {
    // Pung of dots_5 (the gold type) - cannot upgrade even if have 4th
    const hand: TileId[] = ['dots_5_3', 'dots_2_0', 'dots_3_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'pung',
        tiles: ['dots_5_0', 'dots_5_1', 'dots_5_2'],
        calledTile: 'dots_5_2',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    // Actually, pung of gold shouldn't be possible in the first place,
    // but if it somehow exists, we shouldn't upgrade it
    expect(result.length).toBe(0);
  });

  it('should return all upgradeable pungs when multiple exist', () => {
    const hand: TileId[] = ['dots_2_3', 'dots_3_3'];
    const exposedMelds: Meld[] = [
      {
        type: 'pung',
        tiles: ['dots_3_0', 'dots_3_1', 'dots_3_2'],
        calledTile: 'dots_3_2',
      },
      {
        type: 'pung',
        tiles: ['dots_2_0', 'dots_2_1', 'dots_2_2'],
        calledTile: 'dots_2_2',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(2);
    // First pung (dots_3) is at index 0
    expect(result[0].meldIndex).toBe(0);
    expect(result[0].tileFromHand).toBe('dots_3_3');
    // Second pung (dots_2) is at index 1
    expect(result[1].meldIndex).toBe(1);
    expect(result[1].tileFromHand).toBe('dots_2_3');
  });

  it('should skip chows and return pung upgrades only', () => {
    const hand: TileId[] = ['dots_2_3', 'dots_3_0'];
    const exposedMelds: Meld[] = [
      {
        type: 'chow',
        tiles: ['dots_4_0', 'dots_5_0', 'dots_6_0'],
        calledTile: 'dots_4_0',
      },
      {
        type: 'pung',
        tiles: ['dots_2_0', 'dots_2_1', 'dots_2_2'],
        calledTile: 'dots_2_2',
      },
    ];
    const result = canUpgradePungToKong(hand, exposedMelds, goldType);
    expect(result.length).toBe(1);
    expect(result[0].meldIndex).toBe(1);
    expect(result[0].tileFromHand).toBe('dots_2_3');
  });
});
