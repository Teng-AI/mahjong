import { SeatIndex, Settlement, GameRound } from '@/types';

/**
 * Calculate net positions from round history
 *
 * In mahjong, when someone wins X points:
 * - Winner receives X from EACH of the 3 other players (total: X × 3)
 * - Each loser pays X points
 */
export function calculateNetPositions(
  rounds: GameRound[]
): Record<string, number> {
  const netPositions: Record<string, number> = {
    seat0: 0,
    seat1: 0,
    seat2: 0,
    seat3: 0,
  };

  for (const round of rounds) {
    if (round.winnerSeat !== null && round.score > 0) {
      // Winner receives score from each of 3 other players
      netPositions[`seat${round.winnerSeat}`] += round.score * 3;

      // Each other player loses the score
      for (let seat = 0; seat < 4; seat++) {
        if (seat !== round.winnerSeat) {
          netPositions[`seat${seat}`] -= round.score;
        }
      }
    }
  }

  return netPositions;
}

/**
 * Calculate the minimum set of transactions to settle all players
 *
 * Algorithm:
 * 1. Calculate net positions from round history (winner gets score×3, losers pay score each)
 * 2. Separate into creditors (positive) and debtors (negative)
 * 3. Greedily match largest debtor with largest creditor
 * 4. Repeat until all settled
 *
 * This minimizes the number of transactions (max 3 for 4 players)
 */
export function calculateSettlement(
  rounds: GameRound[],
  playerNames: Record<string, string>
): { settlements: Settlement[]; balances: { seat: SeatIndex; name: string; balance: number }[] } {
  const seats = [0, 1, 2, 3] as SeatIndex[];

  // Calculate net positions from rounds
  const netPositions = calculateNetPositions(rounds);

  // Calculate each player's balance
  const balances = seats.map(seat => ({
    seat,
    name: playerNames[`seat${seat}`] || `Player ${seat + 1}`,
    balance: netPositions[`seat${seat}`] || 0,
  }));

  // Separate into creditors and debtors
  type Balance = { seat: SeatIndex; name: string; balance: number };
  const creditors: Balance[] = balances.filter(b => b.balance > 0.01).map(b => ({ ...b }));
  const debtors: Balance[] = balances.filter(b => b.balance < -0.01).map(b => ({ ...b, balance: Math.abs(b.balance) }));

  // Sort by amount (largest first)
  creditors.sort((a, b) => b.balance - a.balance);
  debtors.sort((a, b) => b.balance - a.balance);

  const settlements: Settlement[] = [];

  // Greedily match debtors to creditors
  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];

    // Amount to transfer is minimum of what's owed/owed
    const amount = Math.min(creditor.balance, debtor.balance);

    if (amount > 0.01) {
      settlements.push({
        from: debtor.seat,
        to: creditor.seat,
        amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
      });
    }

    // Update balances
    creditor.balance -= amount;
    debtor.balance -= amount;

    // Remove settled parties
    if (creditor.balance < 0.01) {
      creditors.shift();
    }
    if (debtor.balance < 0.01) {
      debtors.shift();
    }
  }

  return { settlements, balances };
}

/**
 * Format a settlement for display
 */
export function formatSettlement(
  settlement: Settlement,
  playerNames: Record<string, string>
): string {
  const fromName = playerNames[`seat${settlement.from}`] || `Player ${settlement.from + 1}`;
  const toName = playerNames[`seat${settlement.to}`] || `Player ${settlement.to + 1}`;
  return `${fromName} → ${toName}: ${settlement.amount} pts`;
}
