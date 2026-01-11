// Mock Firebase before importing game.ts
jest.mock('@/firebase/config', () => ({
  db: {},
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  runTransaction: jest.fn(),
}));

import {
  getNextSeat,
  hasBonusTiles,
  getBonusTilesFromHand,
  getNonBonusTiles,
  needsToDraw,
  canWin,
  canWinOnDiscard,
} from '@/lib/game';
import { GameState, SeatIndex, TileId, TileType } from '@/types';

// ============================================
// GET NEXT SEAT TESTS
// ============================================

describe('getNextSeat', () => {
  it('should go counter-clockwise: 0 -> 1 -> 2 -> 3 -> 0', () => {
    expect(getNextSeat(0)).toBe(1);
    expect(getNextSeat(1)).toBe(2);
    expect(getNextSeat(2)).toBe(3);
    expect(getNextSeat(3)).toBe(0);
  });

  it('should wrap around correctly', () => {
    // Verify full cycle
    let seat: SeatIndex = 0;
    for (let i = 0; i < 4; i++) {
      seat = getNextSeat(seat);
    }
    expect(seat).toBe(0); // Back to start after 4 moves
  });
});

// ============================================
// BONUS TILE DETECTION TESTS
// ============================================

describe('hasBonusTiles', () => {
  it('should return true when hand contains wind tiles', () => {
    expect(hasBonusTiles(['wind_east_0', 'dots_1_0'])).toBe(true);
    expect(hasBonusTiles(['wind_south_0'])).toBe(true);
    expect(hasBonusTiles(['wind_west_0'])).toBe(true);
    expect(hasBonusTiles(['wind_north_0'])).toBe(true);
  });

  it('should return true when hand contains dragon tiles', () => {
    expect(hasBonusTiles(['dragon_red_0', 'dots_1_0'])).toBe(true);
  });

  it('should return false for only suit tiles', () => {
    expect(hasBonusTiles(['dots_1_0', 'bamboo_5_0', 'characters_9_0'])).toBe(false);
  });

  it('should return false for empty hand', () => {
    expect(hasBonusTiles([])).toBe(false);
  });

  it('should detect multiple bonus tiles', () => {
    expect(hasBonusTiles([
      'wind_east_0',
      'wind_south_0',
      'dragon_red_0',
      'dots_1_0',
    ])).toBe(true);
  });
});

describe('getBonusTilesFromHand', () => {
  it('should extract only bonus tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'wind_east_0', 'bamboo_5_0', 'dragon_red_0'];
    const bonus = getBonusTilesFromHand(hand);

    expect(bonus).toHaveLength(2);
    expect(bonus).toContain('wind_east_0');
    expect(bonus).toContain('dragon_red_0');
  });

  it('should return empty array when no bonus tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'bamboo_5_0', 'characters_9_0'];
    expect(getBonusTilesFromHand(hand)).toHaveLength(0);
  });

  it('should return empty array for empty hand', () => {
    expect(getBonusTilesFromHand([])).toHaveLength(0);
  });

  it('should extract all winds', () => {
    const hand: TileId[] = [
      'wind_east_0',
      'wind_south_0',
      'wind_west_0',
      'wind_north_0',
      'dots_1_0',
    ];
    const bonus = getBonusTilesFromHand(hand);
    expect(bonus).toHaveLength(4);
  });

  it('should preserve order', () => {
    const hand: TileId[] = ['dragon_red_0', 'dots_1_0', 'wind_east_0'];
    const bonus = getBonusTilesFromHand(hand);
    expect(bonus[0]).toBe('dragon_red_0');
    expect(bonus[1]).toBe('wind_east_0');
  });
});

describe('getNonBonusTiles', () => {
  it('should extract only suit tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'wind_east_0', 'bamboo_5_0'];
    const nonBonus = getNonBonusTiles(hand);

    expect(nonBonus).toHaveLength(2);
    expect(nonBonus).toContain('dots_1_0');
    expect(nonBonus).toContain('bamboo_5_0');
  });

  it('should return all tiles when no bonus tiles', () => {
    const hand: TileId[] = ['dots_1_0', 'bamboo_5_0', 'characters_9_0'];
    const nonBonus = getNonBonusTiles(hand);
    expect(nonBonus).toHaveLength(3);
  });

  it('should return empty array for empty hand', () => {
    expect(getNonBonusTiles([])).toHaveLength(0);
  });

  it('should return empty when all bonus tiles', () => {
    const hand: TileId[] = ['wind_east_0', 'dragon_red_0'];
    expect(getNonBonusTiles(hand)).toHaveLength(0);
  });

  it('should handle all three suits', () => {
    const hand: TileId[] = [
      'dots_1_0',
      'bamboo_2_0',
      'characters_3_0',
      'wind_east_0',
    ];
    const nonBonus = getNonBonusTiles(hand);
    expect(nonBonus).toHaveLength(3);
    expect(nonBonus).toContain('dots_1_0');
    expect(nonBonus).toContain('bamboo_2_0');
    expect(nonBonus).toContain('characters_3_0');
  });
});

// ============================================
// NEEDS TO DRAW TESTS
// ============================================

describe('needsToDraw', () => {
  // Helper to create minimal game state
  const createGameState = (overrides: Partial<GameState> = {}): GameState => ({
    phase: 'playing',
    currentPlayerSeat: 0,
    dealerSeat: 0,
    wall: [],
    deadWall: [],
    discardPile: [],
    goldTileType: 'dots_5',
    exposedGold: 'dots_5_0',
    exposedMelds: { seat0: [], seat1: [], seat2: [], seat3: [] },
    bonusTiles: { seat0: [], seat1: [], seat2: [], seat3: [] },
    pendingCalls: null,
    winner: null,
    actionLog: [],
    lastAction: null,
    previousAction: null,
    ...overrides,
  });

  it('should return false after drawing (need to discard)', () => {
    const gameState = createGameState({
      currentPlayerSeat: 0,
      lastAction: { type: 'draw', playerSeat: 0, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false after pung call (already have 17 tiles)', () => {
    const gameState = createGameState({
      currentPlayerSeat: 1,
      lastAction: { type: 'pung', playerSeat: 1, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false after chow call (already have 17 tiles)', () => {
    const gameState = createGameState({
      currentPlayerSeat: 1,
      lastAction: { type: 'chow', playerSeat: 1, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false after kong call (replacement draw happened)', () => {
    const gameState = createGameState({
      currentPlayerSeat: 1,
      lastAction: { type: 'kong', playerSeat: 1, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false at game start (dealer has 17 tiles)', () => {
    const gameState = createGameState({
      lastAction: { type: 'game_start', playerSeat: 0 },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false after bonus expose (still in setup)', () => {
    const gameState = createGameState({
      lastAction: { type: 'bonus_expose', playerSeat: 0 },
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return false when no lastAction', () => {
    const gameState = createGameState({
      lastAction: null,
    });
    expect(needsToDraw(gameState)).toBe(false);
  });

  it('should return true after opponent discards', () => {
    const gameState = createGameState({
      currentPlayerSeat: 1,
      lastAction: { type: 'discard', playerSeat: 0, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(true);
  });

  it('should return true after different player draws (turn changed)', () => {
    const gameState = createGameState({
      currentPlayerSeat: 1, // Current player is seat 1
      lastAction: { type: 'draw', playerSeat: 0, tileType: 'dots_1' }, // But seat 0 drew
    });
    // This shouldn't happen in normal flow, but logic should handle it
    expect(needsToDraw(gameState)).toBe(true);
  });

  it('should handle transition from calling phase', () => {
    // After pass or failed call, next player needs to draw
    const gameState = createGameState({
      currentPlayerSeat: 2,
      lastAction: { type: 'discard', playerSeat: 1, tileType: 'dots_1' },
    });
    expect(needsToDraw(gameState)).toBe(true);
  });
});

// ============================================
// CAN WIN TESTS (wrapper for canFormWinningHand)
// ============================================

describe('canWin', () => {
  const goldType: TileType = 'dots_5';

  it('should detect basic winning hand (5 pungs + pair)', () => {
    const hand: TileId[] = [
      // Pung 1-5
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Pair
      'characters_9_0', 'characters_9_1',
    ];
    expect(canWin(hand, goldType)).toBe(true);
  });

  it('should detect winning hand with chows', () => {
    const hand: TileId[] = [
      // Chow 1-2-3 dots
      'dots_1_0', 'dots_2_0', 'dots_3_0',
      // Chow 4-5-6 dots (note: 5 is gold type but still valid in concealed)
      'dots_4_0', 'dots_5_0', 'dots_6_0',
      // Chow 7-8-9 dots
      'dots_7_0', 'dots_8_0', 'dots_9_0',
      // Pung bamboo 1
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      // Pung bamboo 2
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      // Pair
      'characters_9_0', 'characters_9_1',
    ];
    expect(canWin(hand, goldType)).toBe(true);
  });

  it('should reject non-winning hand', () => {
    const hand: TileId[] = [
      'dots_1_0', 'dots_3_0', 'dots_6_0',
      'bamboo_2_0', 'bamboo_4_0', 'bamboo_7_0',
      'characters_1_0', 'characters_3_0', 'characters_5_0',
      'characters_7_0', 'characters_9_0',
      'dots_2_0', 'dots_4_0',
      'bamboo_1_0', 'bamboo_3_0',
      'characters_2_0', 'characters_4_0',
    ];
    expect(canWin(hand, goldType)).toBe(false);
  });

  it('should account for exposed melds', () => {
    // With 2 exposed melds, need 3 sets + pair from concealed (11 tiles)
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'characters_9_0', 'characters_9_1',
    ];
    expect(canWin(hand, goldType, 2)).toBe(true);
  });

  it('should handle gold tile substitution', () => {
    // Gold (dots_5) substitutes for dots_1
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_5_0', // Pung with gold
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0', 'characters_9_1',
    ];
    expect(canWin(hand, goldType)).toBe(true);
  });

  it('should detect three golds win', () => {
    // Any hand with 3 golds is a win
    const hand: TileId[] = [
      'dots_5_0', 'dots_5_1', 'dots_5_2', // 3 golds
      'dots_1_0', 'dots_2_0', 'dots_3_0',
      'dots_4_0', 'dots_6_0', 'dots_7_0',
      'bamboo_1_0', 'bamboo_2_0', 'bamboo_3_0',
      'characters_1_0', 'characters_2_0',
      'characters_3_0', 'characters_4_0', 'characters_5_0',
    ];
    // Note: Three Golds is checked separately in game logic,
    // but canFormWinningHand should still work with gold substitution
    expect(canWin(hand, goldType)).toBe(true);
  });
});

// ============================================
// CAN WIN ON DISCARD TESTS
// ============================================

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
      'characters_9_0', // Need characters_9 for pair
    ];
    const discard: TileId = 'characters_9_1';
    expect(canWinOnDiscard(hand, discard, goldType)).toBe(true);
  });

  it('should return false when discard does not complete hand', () => {
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0',
    ];
    const discard: TileId = 'characters_8_0'; // Wrong tile
    expect(canWinOnDiscard(hand, discard, goldType)).toBe(false);
  });

  it('should account for exposed melds', () => {
    // With 2 exposed melds, concealed hand is smaller
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', 'dots_1_2',
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'characters_9_0', // Need pair
    ];
    const discard: TileId = 'characters_9_1';
    expect(canWinOnDiscard(hand, discard, goldType, 2)).toBe(true);
  });

  it('should handle gold tile completing hand', () => {
    // Gold can complete a set
    const hand: TileId[] = [
      'dots_1_0', 'dots_1_1', // Need third for pung
      'dots_2_0', 'dots_2_1', 'dots_2_2',
      'dots_3_0', 'dots_3_1', 'dots_3_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0', 'characters_9_1',
    ];
    const goldDiscard: TileId = 'dots_5_0'; // Gold completes the dots_1 pung
    expect(canWinOnDiscard(hand, goldDiscard, goldType)).toBe(true);
  });

  it('should handle chow completion', () => {
    // Missing middle tile for chow
    const hand: TileId[] = [
      'dots_1_0', 'dots_3_0', // Need dots_2 for chow
      'dots_4_0', 'dots_4_1', 'dots_4_2',
      'dots_6_0', 'dots_6_1', 'dots_6_2',
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2',
      'characters_9_0', 'characters_9_1',
    ];
    const discard: TileId = 'dots_2_0';
    expect(canWinOnDiscard(hand, discard, goldType)).toBe(true);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge Cases', () => {
  describe('bonus tile boundaries', () => {
    it('should correctly identify all wind directions as bonus', () => {
      const winds: TileId[] = ['wind_east_0', 'wind_south_0', 'wind_west_0', 'wind_north_0'];
      winds.forEach(wind => {
        expect(hasBonusTiles([wind])).toBe(true);
      });
    });

    it('should correctly identify dragon as bonus', () => {
      expect(hasBonusTiles(['dragon_red_0'])).toBe(true);
    });

    it('should not identify suit tiles as bonus', () => {
      const suitTiles: TileId[] = [
        'dots_1_0', 'dots_9_0',
        'bamboo_1_0', 'bamboo_9_0',
        'characters_1_0', 'characters_9_0',
      ];
      expect(hasBonusTiles(suitTiles)).toBe(false);
    });
  });

  describe('tile instance variations', () => {
    it('should handle all 4 instances of a tile', () => {
      const hand: TileId[] = [
        'wind_east_0',
        'wind_east_1',
        'wind_east_2',
        'wind_east_3',
      ];
      const bonus = getBonusTilesFromHand(hand);
      expect(bonus).toHaveLength(4);
    });
  });

  describe('mixed hands', () => {
    it('should correctly separate mixed hand', () => {
      const hand: TileId[] = [
        'dots_1_0', 'dots_2_0', 'dots_3_0',
        'wind_east_0', 'wind_south_0',
        'bamboo_4_0', 'bamboo_5_0',
        'dragon_red_0',
        'characters_7_0', 'characters_8_0', 'characters_9_0',
      ];

      const bonus = getBonusTilesFromHand(hand);
      const nonBonus = getNonBonusTiles(hand);

      expect(bonus).toHaveLength(3); // 2 winds + 1 dragon
      expect(nonBonus).toHaveLength(8); // 3 dots + 2 bamboo + 3 characters
      expect(bonus.length + nonBonus.length).toBe(hand.length);
    });
  });
});
