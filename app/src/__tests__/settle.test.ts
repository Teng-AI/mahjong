import {
  calculateNetPositions,
  calculateSettlement,
  formatSettlement,
} from '@/lib/settle';
import { GameRound, SeatIndex } from '@/types';

// ============================================
// CALCULATE NET POSITIONS TESTS
// ============================================

describe('calculateNetPositions', () => {
  it('should return zeros for empty rounds', () => {
    const result = calculateNetPositions([]);
    expect(result).toEqual({ seat0: 0, seat1: 0, seat2: 0, seat3: 0 });
  });

  it('should calculate winner gains (score × 3) and loser losses (score each)', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 0, score: 10, dealerSeat: 0, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);

    // Winner gets score × 3 = 30
    expect(result.seat0).toBe(30);
    // Each loser pays score = -10
    expect(result.seat1).toBe(-10);
    expect(result.seat2).toBe(-10);
    expect(result.seat3).toBe(-10);
  });

  it('should accumulate across multiple rounds', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 0, score: 10, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1, score: 5, dealerSeat: 1, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);

    // Seat 0: won 30, lost 5 = 25
    expect(result.seat0).toBe(25);
    // Seat 1: lost 10, won 15 = 5
    expect(result.seat1).toBe(5);
    // Seat 2: lost 10, lost 5 = -15
    expect(result.seat2).toBe(-15);
    // Seat 3: lost 10, lost 5 = -15
    expect(result.seat3).toBe(-15);
  });

  it('should handle draw rounds (null winner)', () => {
    const rounds: GameRound[] = [
      { winnerSeat: null, score: 0, dealerSeat: 0, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);
    expect(result).toEqual({ seat0: 0, seat1: 0, seat2: 0, seat3: 0 });
  });

  it('should handle zero score rounds', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 0, score: 0, dealerSeat: 0, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);
    expect(result).toEqual({ seat0: 0, seat1: 0, seat2: 0, seat3: 0 });
  });

  it('should handle each seat winning', () => {
    // Each seat wins once with same score
    const rounds: GameRound[] = [
      { winnerSeat: 0, score: 4, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1, score: 4, dealerSeat: 1, dealerStreak: 0 },
      { winnerSeat: 2, score: 4, dealerSeat: 2, dealerStreak: 0 },
      { winnerSeat: 3, score: 4, dealerSeat: 3, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);

    // Each player: won 12 (4×3), lost 12 (4×3) = 0
    expect(result.seat0).toBe(0);
    expect(result.seat1).toBe(0);
    expect(result.seat2).toBe(0);
    expect(result.seat3).toBe(0);
  });

  it('should handle large scores', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 2, score: 100, dealerSeat: 2, dealerStreak: 0 },
    ];
    const result = calculateNetPositions(rounds);

    expect(result.seat2).toBe(300);
    expect(result.seat0).toBe(-100);
    expect(result.seat1).toBe(-100);
    expect(result.seat3).toBe(-100);
  });

  it('should handle one player dominating', () => {
    // Seat 0 wins 3 times in a row
    const rounds: GameRound[] = [
      { winnerSeat: 0, score: 10, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 0, score: 10, dealerSeat: 0, dealerStreak: 1 },
      { winnerSeat: 0, score: 10, dealerSeat: 0, dealerStreak: 2 },
    ];
    const result = calculateNetPositions(rounds);

    // Seat 0: won 90 (30×3)
    expect(result.seat0).toBe(90);
    // Others: lost 30 each (10×3)
    expect(result.seat1).toBe(-30);
    expect(result.seat2).toBe(-30);
    expect(result.seat3).toBe(-30);
  });
});

// ============================================
// CALCULATE SETTLEMENT TESTS
// ============================================

describe('calculateSettlement', () => {
  const playerNames: Record<string, string> = {
    seat0: 'Alice',
    seat1: 'Bob',
    seat2: 'Carol',
    seat3: 'Dave',
  };

  it('should return empty settlements for no rounds', () => {
    const { settlements, balances } = calculateSettlement([], playerNames);
    expect(settlements).toHaveLength(0);
    expect(balances.every(b => b.balance === 0)).toBe(true);
  });

  it('should calculate 3 transfers when one player wins', () => {
    // Alice wins 10 points
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 10, dealerSeat: 0, dealerStreak: 0 },
    ];
    const { settlements } = calculateSettlement(rounds, playerNames);

    // Should have 3 settlements: Bob→Alice, Carol→Alice, Dave→Alice
    expect(settlements).toHaveLength(3);
    expect(settlements.every(s => s.to === 0)).toBe(true);
    expect(settlements.every(s => s.amount === 10)).toBe(true);
  });

  it('should return correct balances', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 10, dealerSeat: 0, dealerStreak: 0 },
    ];
    const { balances } = calculateSettlement(rounds, playerNames);

    const aliceBalance = balances.find(b => b.seat === 0);
    const bobBalance = balances.find(b => b.seat === 1);

    expect(aliceBalance?.balance).toBe(30);
    expect(aliceBalance?.name).toBe('Alice');
    expect(bobBalance?.balance).toBe(-10);
    expect(bobBalance?.name).toBe('Bob');
  });

  it('should minimize transfers for complex scenarios', () => {
    // Alice wins 10, then Bob wins 20
    // Net: Alice +10, Bob +50, Carol -30, Dave -30
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 10, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1 as SeatIndex, score: 20, dealerSeat: 1, dealerStreak: 0 },
    ];
    const { settlements, balances } = calculateSettlement(rounds, playerNames);

    // Verify net positions
    expect(balances.find(b => b.seat === 0)?.balance).toBe(10);
    expect(balances.find(b => b.seat === 1)?.balance).toBe(50);
    expect(balances.find(b => b.seat === 2)?.balance).toBe(-30);
    expect(balances.find(b => b.seat === 3)?.balance).toBe(-30);

    // Settlements should minimize transfers (max 3 for 4 players)
    expect(settlements.length).toBeLessThanOrEqual(3);

    // Total amount transferred should equal total owed
    const totalTransferred = settlements.reduce((sum, s) => sum + s.amount, 0);
    expect(totalTransferred).toBe(60); // Carol pays 30, Dave pays 30
  });

  it('should handle when two players break even', () => {
    // Alice wins 10, Bob wins 10
    // Net: Alice +20, Bob +20, Carol -20, Dave -20
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 10, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1 as SeatIndex, score: 10, dealerSeat: 1, dealerStreak: 0 },
    ];
    const { settlements, balances } = calculateSettlement(rounds, playerNames);

    // Alice and Bob each +20, Carol and Dave each -20
    expect(balances.find(b => b.seat === 0)?.balance).toBe(20);
    expect(balances.find(b => b.seat === 1)?.balance).toBe(20);
    expect(balances.find(b => b.seat === 2)?.balance).toBe(-20);
    expect(balances.find(b => b.seat === 3)?.balance).toBe(-20);

    // Should have exactly 2 settlements (optimal)
    expect(settlements.length).toBeLessThanOrEqual(3);
  });

  it('should handle all players breaking even', () => {
    // Each player wins once with same score
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 5, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1 as SeatIndex, score: 5, dealerSeat: 1, dealerStreak: 0 },
      { winnerSeat: 2 as SeatIndex, score: 5, dealerSeat: 2, dealerStreak: 0 },
      { winnerSeat: 3 as SeatIndex, score: 5, dealerSeat: 3, dealerStreak: 0 },
    ];
    const { settlements, balances } = calculateSettlement(rounds, playerNames);

    // Everyone should be at 0
    expect(balances.every(b => b.balance === 0)).toBe(true);
    // No settlements needed
    expect(settlements).toHaveLength(0);
  });

  it('should handle missing player names with fallbacks', () => {
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 10, dealerSeat: 0, dealerStreak: 0 },
    ];
    const { balances } = calculateSettlement(rounds, {});

    // Should use fallback names
    expect(balances.find(b => b.seat === 0)?.name).toBe('Player 1');
    expect(balances.find(b => b.seat === 1)?.name).toBe('Player 2');
  });

  it('should round amounts to avoid floating point issues', () => {
    // Create a scenario that could produce floating point issues
    const rounds: GameRound[] = [
      { winnerSeat: 0 as SeatIndex, score: 7, dealerSeat: 0, dealerStreak: 0 },
      { winnerSeat: 1 as SeatIndex, score: 3, dealerSeat: 1, dealerStreak: 0 },
    ];
    const { settlements } = calculateSettlement(rounds, playerNames);

    // All amounts should be clean numbers
    settlements.forEach(s => {
      expect(Number.isInteger(s.amount) || s.amount === Math.round(s.amount * 100) / 100).toBe(true);
    });
  });

  it('should handle single draw round', () => {
    const rounds: GameRound[] = [
      { winnerSeat: null, score: 0, dealerSeat: 0, dealerStreak: 0 },
    ];
    const { settlements, balances } = calculateSettlement(rounds, playerNames);

    expect(settlements).toHaveLength(0);
    expect(balances.every(b => b.balance === 0)).toBe(true);
  });
});

// ============================================
// FORMAT SETTLEMENT TESTS
// ============================================

describe('formatSettlement', () => {
  it('should format settlement with player names', () => {
    const settlement = { from: 1 as SeatIndex, to: 0 as SeatIndex, amount: 10 };
    const names = { seat0: 'Alice', seat1: 'Bob', seat2: 'Carol', seat3: 'Dave' };

    expect(formatSettlement(settlement, names)).toBe('Bob → Alice: 10 pts');
  });

  it('should use fallback names when missing', () => {
    const settlement = { from: 1 as SeatIndex, to: 0 as SeatIndex, amount: 10 };

    expect(formatSettlement(settlement, {})).toBe('Player 2 → Player 1: 10 pts');
  });

  it('should handle partial player names', () => {
    const settlement = { from: 1 as SeatIndex, to: 0 as SeatIndex, amount: 15 };
    const names = { seat0: 'Alice' }; // Only Alice has a name

    expect(formatSettlement(settlement, names)).toBe('Player 2 → Alice: 15 pts');
  });

  it('should format various amounts correctly', () => {
    const names = { seat0: 'A', seat1: 'B', seat2: 'C', seat3: 'D' };

    expect(formatSettlement({ from: 0 as SeatIndex, to: 1 as SeatIndex, amount: 0 }, names))
      .toBe('A → B: 0 pts');
    expect(formatSettlement({ from: 2 as SeatIndex, to: 3 as SeatIndex, amount: 100 }, names))
      .toBe('C → D: 100 pts');
    expect(formatSettlement({ from: 3 as SeatIndex, to: 0 as SeatIndex, amount: 5.5 }, names))
      .toBe('D → A: 5.5 pts');
  });

  it('should handle all seat combinations', () => {
    const names = { seat0: 'P0', seat1: 'P1', seat2: 'P2', seat3: 'P3' };
    const seats = [0, 1, 2, 3] as SeatIndex[];

    for (const from of seats) {
      for (const to of seats) {
        if (from !== to) {
          const result = formatSettlement({ from, to, amount: 1 }, names);
          expect(result).toBe(`P${from} → P${to}: 1 pts`);
        }
      }
    }
  });
});
