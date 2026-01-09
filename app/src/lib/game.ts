import { ref, set, get, update, runTransaction } from 'firebase/database';
import { db } from '@/firebase/config';
import {
  TileId,
  TileType,
  SeatIndex,
  GameState,
  GamePhase,
  PrivateHand,
  Room,
  CallAction,
  PendingCalls,
  ChowOption,
  Meld,
  GameRound,
  SessionScores,
} from '@/types';
import {
  generateAllTiles,
  shuffle,
  isBonusTile,
  isGoldTile,
  getTileType,
  getTileDisplayText,
  countGoldTiles,
  sortTilesForDisplay,
  canFormWinningHand,
  canPung,
  canChow,
  canWinOnDiscard as canWinOnDiscardValidation,
  validateChowSelection,
  hasGoldenPair,
  getWinningTiles,
} from './tiles';

// Seat labels for log messages
const SEAT_NAMES = ['East', 'South', 'West', 'North'] as const;

// TEST MODE: Set to true to deal a winning hand to the dealer
const TEST_WINNING_HAND = false;

/**
 * Add an entry to the game action log
 */
async function addToLog(roomCode: string, message: string): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game/actionLog`));
  const currentLog: string[] = gameSnapshot.exists() ? gameSnapshot.val() : [];

  // Keep full game history
  const newLog = [...currentLog, message];
  await set(ref(db, `rooms/${roomCode}/game/actionLog`), newLog);
}

// ============================================
// SESSION SCORING
// ============================================

/**
 * Record a round result in the session scores
 * Called when a game ends (win or draw)
 * Updates dealer streak: increments if dealer won, resets to 0 otherwise
 */
export async function recordRoundResult(
  roomCode: string,
  winnerSeat: SeatIndex | null,
  winnerName: string,
  score: number,
  dealerSeat: SeatIndex
): Promise<void> {
  // Get current session or initialize
  const sessionSnapshot = await get(ref(db, `rooms/${roomCode}/session`));
  let session: SessionScores;

  if (sessionSnapshot.exists()) {
    session = sessionSnapshot.val() as SessionScores;
  } else {
    session = {
      rounds: [],
      cumulative: {
        seat0: 0,
        seat1: 0,
        seat2: 0,
        seat3: 0,
      },
      dealerStreak: 0,
    };
  }

  // Create round record
  const roundNumber = (session.rounds?.length || 0) + 1;
  const round: GameRound = {
    roundNumber,
    winnerSeat,
    winnerName,
    score,
    dealerSeat,
    timestamp: Date.now(),
  };

  // Update cumulative scores (winner gains only)
  const newCumulative = { ...session.cumulative };
  if (winnerSeat !== null) {
    const seatKey = `seat${winnerSeat}` as keyof typeof newCumulative;
    newCumulative[seatKey] = (newCumulative[seatKey] || 0) + score;
  }

  // Update dealer streak
  // Increment if dealer won, reset to 0 if dealer lost or draw
  const currentStreak = session.dealerStreak || 0;
  const newStreak = (winnerSeat === dealerSeat) ? currentStreak + 1 : 0;

  // Save updated session
  await update(ref(db, `rooms/${roomCode}/session`), {
    rounds: [...(session.rounds || []), round],
    cumulative: newCumulative,
    dealerStreak: newStreak,
  });
}

/**
 * Get player name for a seat
 */
async function getPlayerName(roomCode: string, seat: SeatIndex): Promise<string> {
  const playerSnapshot = await get(ref(db, `rooms/${roomCode}/players/seat${seat}`));
  if (playerSnapshot.exists()) {
    return playerSnapshot.val().name || `Player ${seat + 1}`;
  }
  return `Player ${seat + 1}`;
}

/**
 * Get the current dealer streak from session
 * Returns the number of consecutive wins by the current dealer (0 if none)
 */
export async function getDealerStreak(roomCode: string): Promise<number> {
  const sessionSnapshot = await get(ref(db, `rooms/${roomCode}/session`));
  if (sessionSnapshot.exists()) {
    const session = sessionSnapshot.val() as SessionScores;
    return session.dealerStreak || 0;
  }
  return 0;
}

// ============================================
// GAME INITIALIZATION
// ============================================

/**
 * Initialize a new game for a room
 * - Shuffles tiles
 * - Deals to all players (16 each, 17 to dealer)
 * - Sets up initial game state
 * - Stores private hands separately
 */
export async function initializeGame(roomCode: string, dealerSeat: SeatIndex): Promise<void> {
  // Generate and shuffle tiles
  const allTiles = generateAllTiles();
  let shuffledTiles = shuffle(allTiles);

  // Deal tiles
  const hands: TileId[][] = [[], [], [], []];
  let tileIndex = 0;

  // TEST MODE: Deal a winning hand to the dealer
  if (TEST_WINNING_HAND) {
    // Create a winning hand: 5 sets + 1 pair = 17 tiles
    // Sets: 1-2-3 dots, 4-5-6 dots, 7-8-9 dots, 1-1-1 bamboo, 2-2-2 bamboo
    // Pair: 3-3 bamboo
    const winningHand: TileId[] = [
      'dots_1_0', 'dots_2_0', 'dots_3_0',     // Chow 1-2-3 dots
      'dots_4_0', 'dots_5_0', 'dots_6_0',     // Chow 4-5-6 dots
      'dots_7_0', 'dots_8_0', 'dots_9_0',     // Chow 7-8-9 dots
      'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2', // Pung 1 bamboo
      'bamboo_2_0', 'bamboo_2_1', 'bamboo_2_2', // Pung 2 bamboo
      'bamboo_3_0', 'bamboo_3_1',              // Pair 3 bamboo (17 tiles)
    ];

    // Remove winning hand tiles from shuffled deck
    const usedTiles = new Set(winningHand);
    shuffledTiles = shuffledTiles.filter(t => !usedTiles.has(t));

    // Give dealer the winning hand
    hands[dealerSeat] = winningHand;

    // Deal 16 tiles to other players from remaining deck
    for (let seat = 0; seat < 4; seat++) {
      if (seat !== dealerSeat) {
        for (let i = 0; i < 16; i++) {
          hands[seat].push(shuffledTiles[tileIndex++]);
        }
      }
    }
  } else {
    // Normal dealing
    // Deal 16 tiles to each player
    for (let round = 0; round < 16; round++) {
      for (let seat = 0; seat < 4; seat++) {
        hands[seat].push(shuffledTiles[tileIndex++]);
      }
    }

    // Dealer gets 17th tile
    hands[dealerSeat].push(shuffledTiles[tileIndex++]);
  }

  // Remaining tiles form the wall
  const wall = TEST_WINNING_HAND
    ? shuffledTiles.slice(tileIndex)
    : shuffledTiles.slice(tileIndex);

  // Create initial game state (Gold not yet revealed)
  const gameState: GameState = {
    phase: 'bonus_exposure',
    goldTileType: '', // Will be set after bonus exposure
    exposedGold: '', // Will be set after bonus exposure
    wall,
    discardPile: [],
    currentPlayerSeat: dealerSeat, // Dealer starts bonus exposure
    dealerSeat,
    lastAction: null,
    exposedMelds: {
      seat0: [],
      seat1: [],
      seat2: [],
      seat3: [],
    },
    bonusTiles: {
      seat0: [],
      seat1: [],
      seat2: [],
      seat3: [],
    },
    pendingCalls: null,
    winner: null,
    actionLog: ['Game started'],
  };

  // Write game state to Firebase
  await set(ref(db, `rooms/${roomCode}/game`), gameState);

  // Write private hands to separate paths (for security)
  const privateHandPromises = hands.map((hand, seat) =>
    set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
      concealedTiles: hand,
    } as PrivateHand)
  );

  await Promise.all(privateHandPromises);

  // Update room status
  await update(ref(db, `rooms/${roomCode}`), {
    status: 'playing',
  });
}

// ============================================
// BONUS TILE EXPOSURE
// ============================================

/**
 * Get the next player seat (counter-clockwise)
 */
export function getNextSeat(currentSeat: SeatIndex): SeatIndex {
  return ((currentSeat + 1) % 4) as SeatIndex;
}

/**
 * Check if a hand has any bonus tiles
 */
export function hasBonusTiles(tiles: TileId[]): boolean {
  return tiles.some(isBonusTile);
}

/**
 * Get all bonus tiles from a hand
 */
export function getBonusTilesFromHand(tiles: TileId[]): TileId[] {
  return tiles.filter(isBonusTile);
}

/**
 * Get non-bonus tiles from a hand
 */
export function getNonBonusTiles(tiles: TileId[]): TileId[] {
  return tiles.filter(tile => !isBonusTile(tile));
}

/**
 * Process bonus tile exposure for a player
 * Returns the updated hand and exposed bonus tiles
 */
export async function exposeBonusTiles(
  roomCode: string,
  seat: SeatIndex
): Promise<{ success: boolean; wallEmpty?: boolean }> {
  // Get current hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false };
  }

  const privateHand = handSnapshot.val() as PrivateHand;
  let currentHand = [...privateHand.concealedTiles];

  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false };
  }

  const gameState = gameSnapshot.val() as GameState;
  let wall = [...(gameState.wall || [])];
  const exposedBonus: TileId[] = [...(gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [])];

  // Keep exposing bonus tiles until none remain
  let bonusTiles = getBonusTilesFromHand(currentHand);

  while (bonusTiles.length > 0) {
    // Check if wall is empty
    if (wall.length === 0) {
      // Save current state and return wall empty
      await update(ref(db, `rooms/${roomCode}/game`), {
        wall,
        [`bonusTiles/seat${seat}`]: exposedBonus,
        phase: 'ended',
      });
      await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
        concealedTiles: currentHand,
      });
      return { success: true, wallEmpty: true };
    }

    // Move first bonus tile to exposed
    const bonusTile = bonusTiles[0];
    exposedBonus.push(bonusTile);
    currentHand = currentHand.filter(t => t !== bonusTile);

    // Draw replacement from wall
    const replacement = wall.shift()!;
    currentHand.push(replacement);

    // Check for more bonus tiles
    bonusTiles = getBonusTilesFromHand(currentHand);
  }

  // Update Firebase with results
  await update(ref(db, `rooms/${roomCode}/game`), {
    wall,
    [`bonusTiles/seat${seat}`]: exposedBonus,
  });

  await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
    concealedTiles: currentHand,
  });

  // Log the bonus exposure
  const exposedCount = exposedBonus.length - (gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles]?.length || 0);
  if (exposedCount > 0) {
    const exposedNames = exposedBonus.slice(-exposedCount).map(t => getTileDisplayText(getTileType(t))).join(', ');
    await addToLog(roomCode, `${SEAT_NAMES[seat]} exposed bonus: ${exposedNames}`);
  } else {
    await addToLog(roomCode, `${SEAT_NAMES[seat]} had no bonus tiles`);
  }

  return { success: true };
}

/**
 * Move to next player for bonus exposure, or reveal Gold if all done
 */
export async function advanceBonusExposure(
  roomCode: string,
  currentSeat: SeatIndex,
  dealerSeat: SeatIndex
): Promise<{ phase: 'bonus_exposure' | 'playing' | 'ended'; nextSeat?: SeatIndex }> {
  const nextSeat = getNextSeat(currentSeat);

  // Check if we've gone full circle back to dealer
  if (nextSeat === dealerSeat) {
    // All players done - reveal Gold and transition to playing
    await revealGoldTile(roomCode);
    return { phase: 'playing' };
  }

  // Move to next player
  await update(ref(db, `rooms/${roomCode}/game`), {
    currentPlayerSeat: nextSeat,
  });

  return { phase: 'bonus_exposure', nextSeat };
}

// ============================================
// GOLD TILE SYSTEM
// ============================================

/**
 * Reveal the Gold tile from the wall
 * Called after all bonus tiles are exposed
 *
 * If the revealed tile is a bonus tile (wind/dragon), the dealer receives it
 * and we keep drawing until we get a suited tile for the Gold.
 */
export async function revealGoldTile(roomCode: string): Promise<{
  goldTileType: TileType;
  threeGoldsWinner: SeatIndex | null;
  robbingGoldWinner: SeatIndex | null;
}> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    throw new Error('Game not found');
  }

  const gameState = gameSnapshot.val() as GameState;
  const wall = [...gameState.wall];
  const dealerSeat = gameState.dealerSeat;

  // Get dealer's current bonus tiles
  const dealerBonusTiles = [
    ...(gameState.bonusTiles?.[`seat${dealerSeat}` as keyof typeof gameState.bonusTiles] || [])
  ];
  const bonusTilesGiven: TileId[] = [];

  // Keep drawing until we get a suited (non-bonus) tile for Gold
  let exposedGold = wall.shift()!;

  while (isBonusTile(exposedGold) && wall.length > 0) {
    // Bonus tile goes to dealer
    dealerBonusTiles.push(exposedGold);
    bonusTilesGiven.push(exposedGold);

    // Draw next tile
    exposedGold = wall.shift()!;
  }

  // If we exhausted the wall and still have a bonus tile, handle edge case
  // (This is extremely rare but we should handle it)
  if (isBonusTile(exposedGold)) {
    // Give this last bonus to dealer too
    dealerBonusTiles.push(exposedGold);
    bonusTilesGiven.push(exposedGold);
    // Use a fallback - this shouldn't happen in practice with 128 tiles
    throw new Error('Wall exhausted while revealing Gold tile - no suited tiles remain');
  }

  const goldTileType = getTileType(exposedGold);

  // Update dealer's bonus tiles if any were given
  if (bonusTilesGiven.length > 0) {
    await update(ref(db, `rooms/${roomCode}/game`), {
      [`bonusTiles/seat${dealerSeat}`]: dealerBonusTiles,
    });

    // Log bonus tiles given to dealer
    const bonusNames = bonusTilesGiven.map(t => getTileDisplayText(getTileType(t))).join(', ');
    await addToLog(roomCode, `Dealer received bonus from Gold reveal: ${bonusNames}`);
  }

  // Update game state with Gold info
  await update(ref(db, `rooms/${roomCode}/game`), {
    goldTileType,
    exposedGold,
    wall,
    phase: 'playing',
    currentPlayerSeat: gameState.dealerSeat,
  });

  // Sort all hands now that Gold is known
  await sortAllHands(roomCode, goldTileType);

  // Log Gold reveal
  await addToLog(roomCode, `Gold tile revealed: ${getTileDisplayText(goldTileType)}`);

  // Check all players for Three Golds
  const threeGoldsWinner = await checkAllPlayersForThreeGolds(roomCode, goldTileType);

  // If Three Golds winner, game is already ended
  if (threeGoldsWinner !== null) {
    return { goldTileType, threeGoldsWinner, robbingGoldWinner: null };
  }

  // Check for Robbing the Gold (抢金)
  const robbingGoldWinner = await checkRobbingGold(roomCode, goldTileType, exposedGold, dealerSeat);

  return { goldTileType, threeGoldsWinner, robbingGoldWinner };
}

/**
 * Sort all players' hands after Gold is revealed
 */
async function sortAllHands(roomCode: string, goldTileType: TileType): Promise<void> {
  const sortPromises = ([0, 1, 2, 3] as SeatIndex[]).map(async (seat) => {
    const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
    if (handSnapshot.exists()) {
      const hand = handSnapshot.val() as PrivateHand;
      const sortedTiles = sortTilesForDisplay(hand.concealedTiles, goldTileType);
      await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
        concealedTiles: sortedTiles,
      });
    }
  });

  await Promise.all(sortPromises);
}

/**
 * Check all players for Three Golds (instant win)
 */
async function checkAllPlayersForThreeGolds(
  roomCode: string,
  goldTileType: TileType
): Promise<SeatIndex | null> {
  for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
    const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
    if (handSnapshot.exists()) {
      const hand = handSnapshot.val() as PrivateHand;
      const goldCount = countGoldTiles(hand.concealedTiles, goldTileType);

      if (goldCount === 3) {
        // Three Golds! Instant win
        await handleThreeGoldsWin(roomCode, seat, hand.concealedTiles, goldTileType);
        return seat;
      }
    }
  }

  return null;
}

/**
 * Handle Three Golds instant win
 */
async function handleThreeGoldsWin(
  roomCode: string,
  winnerSeat: SeatIndex,
  hand: TileId[],
  goldTileType: TileType,
  winningTile?: TileId
): Promise<void> {
  // Get bonus tiles for scoring
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;
  const bonusTiles = gameState.bonusTiles[`seat${winnerSeat}` as keyof typeof gameState.bonusTiles] || [];

  // Get dealer streak bonus (only if winner is dealer)
  const currentStreak = await getDealerStreak(roomCode);
  const dealerStreakBonus = (winnerSeat === gameState.dealerSeat && currentStreak > 0) ? currentStreak : 0;

  // Calculate score
  const base = 1;
  const bonusCount = bonusTiles.length;
  const goldCount = 3;
  const subtotal = base + bonusCount + goldCount + dealerStreakBonus;
  const multiplier = 2; // Self-draw (Three Golds always counts as self-draw)
  const threeGoldsBonus = 20;
  const total = subtotal * multiplier + threeGoldsBonus;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat: winnerSeat,
      isSelfDraw: true,
      isThreeGolds: true,
      isRobbingGold: false,
      hand,
      ...(winningTile ? { winningTile } : {}),
      score: {
        base,
        bonusTiles: bonusCount,
        golds: goldCount,
        dealerStreakBonus,
        subtotal,
        multiplier,
        threeGoldsBonus,
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Record round result for cumulative scoring
  const winnerName = await getPlayerName(roomCode, winnerSeat);
  await recordRoundResult(roomCode, winnerSeat, winnerName, total, gameState.dealerSeat);

  // Log the win
  await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} wins with Three Golds! Score: ${total}`);
}

/**
 * Check for Robbing the Gold (抢金) after Gold tile is revealed
 * Priority order:
 * 1. Dealer - already has winning hand (no swap needed)
 * 2. Non-dealers in turn order - tenpai and Gold completes hand
 * 3. Dealer - can swap any tile with Gold to win
 */
async function checkRobbingGold(
  roomCode: string,
  goldTileType: TileType,
  exposedGold: TileId,
  dealerSeat: SeatIndex
): Promise<SeatIndex | null> {
  // Get all hands
  const hands: Map<SeatIndex, TileId[]> = new Map();
  for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
    const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
    if (handSnapshot.exists()) {
      const hand = handSnapshot.val() as PrivateHand;
      hands.set(seat, hand.concealedTiles);
    }
  }

  // Priority 1: Dealer already has winning hand (17 tiles, no Gold needed)
  const dealerHand = hands.get(dealerSeat);
  if (dealerHand && canFormWinningHand(dealerHand, goldTileType, 0)) {
    await handleRobbingGoldWin(roomCode, dealerSeat, dealerHand, goldTileType, exposedGold, 'dealer_no_swap');
    return dealerSeat;
  }

  // Priority 2: Non-dealers in turn order (counter-clockwise from dealer)
  // Check if they're tenpai and the Gold tile type completes their hand
  const nonDealerOrder = [
    ((dealerSeat + 1) % 4) as SeatIndex,
    ((dealerSeat + 2) % 4) as SeatIndex,
    ((dealerSeat + 3) % 4) as SeatIndex,
  ];

  for (const seat of nonDealerOrder) {
    const hand = hands.get(seat);
    if (hand && hand.length === 16) {
      // Check if this player is tenpai on the Gold tile type
      const winningTypes = getWinningTiles(hand, goldTileType);
      if (winningTypes.includes(goldTileType)) {
        // This player can win by taking the Gold tile
        const winningHand = [...hand, exposedGold];
        await handleRobbingGoldWin(roomCode, seat, winningHand, goldTileType, exposedGold, 'non_dealer');
        return seat;
      }
    }
  }

  // Priority 3: Dealer can swap any tile with Gold to form winning hand
  if (dealerHand && dealerHand.length === 17) {
    for (let i = 0; i < dealerHand.length; i++) {
      const tileToSwap = dealerHand[i];
      // Don't swap Gold tiles (they're already wildcards)
      if (isGoldTile(tileToSwap, goldTileType)) continue;

      // Create test hand with swap
      const testHand = [...dealerHand];
      testHand.splice(i, 1); // Remove the tile
      testHand.push(exposedGold); // Add the Gold tile

      if (canFormWinningHand(testHand, goldTileType, 0)) {
        // Dealer can win by swapping this tile
        await handleRobbingGoldWin(roomCode, dealerSeat, testHand, goldTileType, exposedGold, 'dealer_swap', tileToSwap);
        return dealerSeat;
      }
    }
  }

  return null;
}

/**
 * Handle Robbing the Gold win
 */
async function handleRobbingGoldWin(
  roomCode: string,
  winnerSeat: SeatIndex,
  hand: TileId[],
  goldTileType: TileType,
  exposedGold: TileId,
  winType: 'dealer_no_swap' | 'non_dealer' | 'dealer_swap',
  swappedTile?: TileId
): Promise<void> {
  // Get game state for bonus tiles and dealer info
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;
  const bonusTiles = gameState.bonusTiles?.[`seat${winnerSeat}` as keyof typeof gameState.bonusTiles] || [];

  // Get dealer streak bonus (only if winner is dealer)
  const currentStreak = await getDealerStreak(roomCode);
  const dealerStreakBonus = (winnerSeat === gameState.dealerSeat && currentStreak > 0) ? currentStreak : 0;

  // Calculate score
  const goldCount = countGoldTiles(hand, goldTileType);
  const bonusCount = bonusTiles.length;
  const base = 1;
  const subtotal = base + bonusCount + goldCount + dealerStreakBonus;
  const multiplier = 2; // Self-draw multiplier
  const robbingGoldBonus = 20;

  // Check for special bonuses
  const goldenPairBonus = hasGoldenPair(hand, goldTileType, 0) ? 30 : 0;
  const noBonusBonus = bonusCount === 0 ? 10 : 0;

  const total = (subtotal * multiplier) + robbingGoldBonus + goldenPairBonus + noBonusBonus;

  // Update the winner's hand in private hands (for dealer swap case)
  if (winType === 'dealer_swap' || winType === 'non_dealer') {
    await set(ref(db, `rooms/${roomCode}/privateHands/seat${winnerSeat}`), {
      concealedTiles: hand,
    });
  }

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat: winnerSeat,
      isSelfDraw: true,
      isThreeGolds: false,
      isRobbingGold: true,
      winningTile: exposedGold,
      hand,
      score: {
        base,
        bonusTiles: bonusCount,
        golds: goldCount,
        dealerStreakBonus,
        subtotal,
        multiplier,
        robbingGoldBonus,
        ...(goldenPairBonus > 0 ? { goldenPairBonus } : {}),
        ...(noBonusBonus > 0 ? { noBonusBonus } : {}),
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Record round result
  const winnerName = await getPlayerName(roomCode, winnerSeat);
  await recordRoundResult(roomCode, winnerSeat, winnerName, total, gameState.dealerSeat);

  // Log the win with appropriate message
  const goldName = getTileDisplayText(goldTileType);
  if (winType === 'dealer_no_swap') {
    await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} (Dealer) wins by Robbing the Gold (${goldName})! Already had winning hand. Score: ${total}`);
  } else if (winType === 'non_dealer') {
    await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} wins by Robbing the Gold (${goldName})! Score: ${total}`);
  } else {
    const swappedName = swappedTile ? getTileDisplayText(getTileType(swappedTile)) : '?';
    await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} (Dealer) wins by Robbing the Gold! Swapped ${swappedName} for ${goldName}. Score: ${total}`);
  }
}

// ============================================
// TURN LOOP - PHASE 5
// ============================================

/**
 * Check if current player needs to draw (vs. discard)
 * - Dealer's first turn: skip draw (already has 17 tiles)
 * - After any discard: next player draws
 * - After drawing: same player discards
 * - After pung/chow: caller skips draw (already has 17 tiles from meld)
 */
export function needsToDraw(gameState: GameState): boolean {
  // If we just drew, we need to discard instead
  if (
    gameState.lastAction?.type === 'draw' &&
    gameState.lastAction.playerSeat === gameState.currentPlayerSeat
  ) {
    return false;
  }

  // After Pung or Chow call, skip draw (caller already has 17 tiles: 14 + meld of 3)
  if (
    (gameState.lastAction?.type === 'pung' || gameState.lastAction?.type === 'chow') &&
    gameState.lastAction.playerSeat === gameState.currentPlayerSeat
  ) {
    return false;
  }

  // Dealer's first turn - already has 17 tiles, skip draw
  // This includes: game_start, after bonus_expose, or no lastAction
  if (
    !gameState.lastAction ||
    gameState.lastAction?.type === 'bonus_expose' ||
    gameState.lastAction?.type === 'game_start'
  ) {
    return false;
  }

  // After a discard, current player needs to draw
  return true;
}

/**
 * Draw a tile from the wall
 * - Handles bonus tiles (auto-expose with replacement)
 * - Checks Three Golds after draw
 * - Returns draw result
 */
export async function drawTile(
  roomCode: string,
  seat: SeatIndex
): Promise<{
  success: boolean;
  drawnTile?: TileId;
  wallEmpty?: boolean;
  threeGoldsWin?: boolean;
  bonusTilesExposed?: TileId[];
}> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify it's this player's turn and they need to draw
  if (gameState.currentPlayerSeat !== seat) {
    return { success: false };
  }

  let wall = [...(gameState.wall || [])];

  // Check wall empty
  if (wall.length === 0) {
    await handleDrawGame(roomCode);
    return { success: true, wallEmpty: true };
  }

  // Get current hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false };
  }

  const privateHand = handSnapshot.val() as PrivateHand;
  let currentHand = [...privateHand.concealedTiles];
  const bonusTilesExposed: TileId[] = [];
  const currentBonusTiles = [
    ...(gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || []),
  ];

  // Draw tile (and handle bonus tiles)
  let drawnTile = wall.shift()!;
  currentHand.push(drawnTile);

  // Handle bonus tiles - keep drawing until non-bonus
  while (isBonusTile(drawnTile)) {
    // Move bonus tile to exposed
    bonusTilesExposed.push(drawnTile);
    currentBonusTiles.push(drawnTile);
    currentHand = currentHand.filter((t) => t !== drawnTile);

    // Check wall for replacement
    if (wall.length === 0) {
      // Save state and end game
      await update(ref(db, `rooms/${roomCode}/game`), {
        wall,
        [`bonusTiles/seat${seat}`]: currentBonusTiles,
        phase: 'ended',
      });
      await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
        concealedTiles: currentHand,
      });
      await handleDrawGame(roomCode);
      return { success: true, wallEmpty: true, bonusTilesExposed };
    }

    // Draw replacement
    drawnTile = wall.shift()!;
    currentHand.push(drawnTile);
  }

  // Check Three Golds
  const goldCount = countGoldTiles(currentHand, gameState.goldTileType);
  if (goldCount === 3) {
    // Three Golds win! The drawnTile is the tile that completed 3 golds
    await handleThreeGoldsWin(roomCode, seat, currentHand, gameState.goldTileType, drawnTile);
    return { success: true, threeGoldsWin: true, drawnTile, bonusTilesExposed };
  }

  // Sort hand after draw
  const sortedHand = sortTilesForDisplay(currentHand, gameState.goldTileType);

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    wall,
    [`bonusTiles/seat${seat}`]: currentBonusTiles,
    lastAction: {
      type: 'draw',
      playerSeat: seat,
      tile: drawnTile,
      timestamp: Date.now(),
    },
  });

  // Update private hand
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
    concealedTiles: sortedHand,
  });

  // Log the draw action
  if (bonusTilesExposed.length > 0) {
    const bonusNames = bonusTilesExposed.map(t => getTileDisplayText(getTileType(t))).join(', ');
    await addToLog(roomCode, `${SEAT_NAMES[seat]} exposed bonus: ${bonusNames}`);
  }
  await addToLog(roomCode, `${SEAT_NAMES[seat]} drew a tile`);

  return {
    success: true,
    drawnTile,
    bonusTilesExposed: bonusTilesExposed.length > 0 ? bonusTilesExposed : undefined,
  };
}

/**
 * Discard a tile from hand
 * - Removes tile from hand
 * - Adds to discard pile
 * - Enters calling phase for other players to respond
 */
export async function discardTile(
  roomCode: string,
  seat: SeatIndex,
  tileId: TileId
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify it's this player's turn
  if (gameState.currentPlayerSeat !== seat) {
    return { success: false };
  }

  // Gold tiles cannot be discarded - they must be kept
  if (isGoldTile(tileId, gameState.goldTileType)) {
    return { success: false };
  }

  // Cannot discard the same tile type you just called on (pung/chow)
  if (
    (gameState.lastAction?.type === 'pung' || gameState.lastAction?.type === 'chow') &&
    gameState.lastAction.playerSeat === seat &&
    gameState.lastAction.tile &&
    getTileType(tileId) === getTileType(gameState.lastAction.tile)
  ) {
    return { success: false, error: 'Cannot discard the same tile type you just called' };
  }

  // Get current hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false };
  }

  const privateHand = handSnapshot.val() as PrivateHand;
  const currentHand = [...privateHand.concealedTiles];

  // Find and remove the tile from hand
  const tileIndex = currentHand.indexOf(tileId);
  if (tileIndex === -1) {
    return { success: false };
  }
  currentHand.splice(tileIndex, 1);

  // Add to discard pile
  const discardPile = [...(gameState.discardPile || []), tileId];

  // Initialize pending calls - discarder is marked, others are null (waiting)
  const pendingCalls = {
    seat0: seat === 0 ? 'discarder' : null,
    seat1: seat === 1 ? 'discarder' : null,
    seat2: seat === 2 ? 'discarder' : null,
    seat3: seat === 3 ? 'discarder' : null,
  };

  // Update game state - enter calling phase
  await update(ref(db, `rooms/${roomCode}/game`), {
    discardPile,
    phase: 'calling',
    pendingCalls,
    lastAction: {
      type: 'discard',
      playerSeat: seat,
      tile: tileId,
      timestamp: Date.now(),
    },
  });

  // Update private hand
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
    concealedTiles: currentHand,
  });

  // Log the discard
  const tileName = getTileDisplayText(getTileType(tileId));
  await addToLog(roomCode, `${SEAT_NAMES[seat]} discarded ${tileName}`);

  return { success: true };
}

/**
 * Handle game ending in a draw (wall exhausted)
 */
export async function handleDrawGame(roomCode: string): Promise<void> {
  // Get dealer seat before ending game
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;
  const dealerSeat = gameState.dealerSeat;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: null, // null winner indicates draw
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Record draw result (0 score, no winner) - resets dealer streak
  await recordRoundResult(roomCode, null, 'Draw', 0, dealerSeat);
}

// ============================================
// CALLING SYSTEM - PHASE 8
// ============================================

/**
 * Submit a call response for a player
 * Called when player clicks Win, Pung, Chow, or Pass
 */
export async function submitCallResponse(
  roomCode: string,
  seat: SeatIndex,
  action: CallAction,
  chowTiles?: [TileId, TileId]
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify we're in calling phase
  if (gameState.phase !== 'calling') {
    return { success: false, error: 'Not in calling phase' };
  }

  // Verify this player hasn't already responded
  // Firebase doesn't store null values, so undefined means no response yet
  const currentCall = gameState.pendingCalls?.[`seat${seat}` as keyof PendingCalls];
  if (currentCall) {
    return { success: false, error: 'Already responded' };
  }

  // Get player's hand for validation
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }
  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Get discard info
  const discardTile = gameState.lastAction!.tile!;
  const discarderSeat = gameState.lastAction!.playerSeat;
  const nextInTurn = getNextSeat(discarderSeat);
  const isNextInTurn = seat === nextInTurn;

  // Get exposed melds for hand size validation
  const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
  const exposedMeldCount = exposedMelds.length;

  // Validate the call
  if (action === 'win') {
    if (!canWinOnDiscardValidation(hand, discardTile, gameState.goldTileType, exposedMeldCount)) {
      return { success: false, error: 'Cannot win on this tile' };
    }
  } else if (action === 'pung') {
    if (!canPung(hand, discardTile, gameState.goldTileType, exposedMeldCount)) {
      return { success: false, error: 'Cannot pung this tile' };
    }
  } else if (action === 'chow') {
    if (!isNextInTurn) {
      return { success: false, error: 'Only next player can chow' };
    }
    if (!chowTiles) {
      return { success: false, error: 'Chow tiles required' };
    }
    const chowOption = validateChowSelection(hand, discardTile, chowTiles, gameState.goldTileType, exposedMeldCount);
    if (!chowOption) {
      return { success: false, error: 'Invalid chow selection' };
    }
    // Store the validated chow option
    await update(ref(db, `rooms/${roomCode}/game`), {
      pendingChowOption: chowOption,
    });
  }
  // 'pass' always valid

  // Use transaction to atomically update and check if all responded
  // This ensures we see consistent state across multiple browser tabs
  const pendingCallsRef = ref(db, `rooms/${roomCode}/game/pendingCalls`);

  let shouldResolve = false;

  await runTransaction(pendingCallsRef, (currentCalls) => {
    if (currentCalls === null || currentCalls === undefined) {
      // pendingCalls was already cleared - another player resolved
      return; // Abort transaction
    }

    // Update with our response
    currentCalls[`seat${seat}`] = action;

    // Check if all have responded
    const allResponded = ([0, 1, 2, 3] as SeatIndex[]).every(s => {
      const call = currentCalls[`seat${s}`];
      return !!call;
    });

    if (allResponded) {
      shouldResolve = true;
    }

    return currentCalls;
  });

  if (shouldResolve) {
    // Resolve the calling phase
    await resolveCallingPhase(roomCode);
  }

  return { success: true };
}

/**
 * Resolve the calling phase after all players respond
 * Priority: Win > Pung > Chow
 */
async function resolveCallingPhase(roomCode: string): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;

  // Guard against race condition: if pendingCalls is already null,
  // another call's resolution beat us - just return
  if (!gameState.pendingCalls) {
    return;
  }

  const pendingCalls = gameState.pendingCalls;
  const discardTile = gameState.lastAction!.tile!;
  const discarderSeat = gameState.lastAction!.playerSeat;

  // Collect calls by type
  const winCallers: SeatIndex[] = [];
  const pungCallers: SeatIndex[] = [];
  let chowCaller: SeatIndex | null = null;

  for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
    const call = pendingCalls[`seat${seat}` as keyof PendingCalls];
    if (call === 'win') winCallers.push(seat);
    else if (call === 'pung') pungCallers.push(seat);
    else if (call === 'chow') chowCaller = seat;
  }

  // Priority resolution: Win > Pung > Chow
  if (winCallers.length > 0) {
    // Handle win(s) - first in turn order from discarder wins
    const turnOrder = getTurnOrderFromDiscarder(discarderSeat);
    const winner = turnOrder.find(s => winCallers.includes(s))!;
    await executeWinCall(roomCode, winner, discardTile, discarderSeat);
    return;
  }

  if (pungCallers.length > 0) {
    // Take first pung caller (should only be one valid in practice)
    await executePungCall(roomCode, pungCallers[0], discardTile);
    return;
  }

  if (chowCaller !== null) {
    await executeChowCall(roomCode, chowCaller, discardTile, gameState.pendingChowOption!);
    return;
  }

  // No calls - advance to next player
  await advanceToNextPlayer(roomCode, discarderSeat);
}

/**
 * Get turn order starting from discarder (for resolving multiple wins)
 */
function getTurnOrderFromDiscarder(discarderSeat: SeatIndex): SeatIndex[] {
  const order: SeatIndex[] = [];
  for (let i = 1; i <= 3; i++) {
    order.push(((discarderSeat + i) % 4) as SeatIndex);
  }
  return order;
}

/**
 * Advance to next player after no calls
 */
async function advanceToNextPlayer(roomCode: string, discarderSeat: SeatIndex): Promise<void> {
  const nextSeat = getNextSeat(discarderSeat);

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'playing',
    currentPlayerSeat: nextSeat,
    pendingCalls: null,
    pendingChowOption: null,
  });

  await addToLog(roomCode, 'All players passed');
}

/**
 * Execute a win call on discard
 */
async function executeWinCall(
  roomCode: string,
  winnerSeat: SeatIndex,
  discardTile: TileId,
  discarderSeat: SeatIndex
): Promise<void> {
  // Clear pending calls first
  await update(ref(db, `rooms/${roomCode}/game`), {
    pendingCalls: null,
    pendingChowOption: null,
  });

  // Use existing win logic
  await declareDiscardWin(roomCode, winnerSeat, discardTile, discarderSeat);
}

/**
 * Execute a Pung call
 * - Remove 2 matching tiles from caller's hand
 * - Remove discarded tile from discard pile
 * - Add meld to caller's exposed melds
 * - Caller becomes current player (must discard, no draw)
 */
async function executePungCall(
  roomCode: string,
  callerSeat: SeatIndex,
  discardTile: TileId
): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;

  // Get caller's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`));
  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Find 2 matching tiles in hand
  const discardType = getTileType(discardTile);
  const matchingTiles: TileId[] = [];
  const remainingHand: TileId[] = [];

  for (const tile of hand) {
    if (getTileType(tile) === discardType && matchingTiles.length < 2) {
      matchingTiles.push(tile);
    } else {
      remainingHand.push(tile);
    }
  }

  // Create meld
  const meld: Meld = {
    type: 'pung',
    tiles: [matchingTiles[0], matchingTiles[1], discardTile],
    calledTile: discardTile,
  };

  // Remove tile from discard pile
  const discardPile = [...gameState.discardPile];
  const discardIndex = discardPile.lastIndexOf(discardTile);
  if (discardIndex !== -1) {
    discardPile.splice(discardIndex, 1);
  }

  // Get existing melds
  const existingMelds = gameState.exposedMelds?.[`seat${callerSeat}` as keyof typeof gameState.exposedMelds] || [];

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'playing',
    currentPlayerSeat: callerSeat,
    discardPile,
    pendingCalls: null,
    pendingChowOption: null,
    [`exposedMelds/seat${callerSeat}`]: [...existingMelds, meld],
    lastAction: {
      type: 'pung',
      playerSeat: callerSeat,
      tile: discardTile,
      timestamp: Date.now(),
    },
  });

  // Update caller's hand (sorted)
  const sortedHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`), {
    concealedTiles: sortedHand,
  });

  const tileName = getTileDisplayText(getTileType(discardTile));
  await addToLog(roomCode, `${SEAT_NAMES[callerSeat]} called Pung on ${tileName}`);
}

/**
 * Execute a Chow call
 * - Remove 2 specified tiles from hand
 * - Create meld with discard
 * - Caller becomes current player (must discard, no draw)
 */
async function executeChowCall(
  roomCode: string,
  callerSeat: SeatIndex,
  discardTile: TileId,
  chowOption: ChowOption
): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;

  // Get caller's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`));
  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Remove specified tiles from hand
  let remainingHand = [...hand];
  for (const tileToRemove of chowOption.tilesFromHand) {
    const idx = remainingHand.indexOf(tileToRemove);
    if (idx !== -1) {
      remainingHand.splice(idx, 1);
    }
  }

  // Create meld (tiles sorted by value for display)
  const meldTiles = [...chowOption.tilesFromHand, discardTile].sort((a, b) => {
    const parsedA = getTileType(a).split('_');
    const parsedB = getTileType(b).split('_');
    return parseInt(parsedA[1]) - parseInt(parsedB[1]);
  });

  const meld: Meld = {
    type: 'chow',
    tiles: meldTiles as [TileId, TileId, TileId],
    calledTile: discardTile,
  };

  // Remove tile from discard pile
  const discardPile = [...gameState.discardPile];
  const discardIndex = discardPile.lastIndexOf(discardTile);
  if (discardIndex !== -1) {
    discardPile.splice(discardIndex, 1);
  }

  // Get existing melds
  const existingMelds = gameState.exposedMelds?.[`seat${callerSeat}` as keyof typeof gameState.exposedMelds] || [];

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'playing',
    currentPlayerSeat: callerSeat,
    discardPile,
    pendingCalls: null,
    pendingChowOption: null,
    [`exposedMelds/seat${callerSeat}`]: [...existingMelds, meld],
    lastAction: {
      type: 'chow',
      playerSeat: callerSeat,
      tile: discardTile,
      timestamp: Date.now(),
    },
  });

  // Update caller's hand (sorted)
  const sortedRemainingHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`), {
    concealedTiles: sortedRemainingHand,
  });

  const tileName = getTileDisplayText(getTileType(discardTile));
  await addToLog(roomCode, `${SEAT_NAMES[callerSeat]} called Chow on ${tileName}`);
}

// ============================================
// GAME QUERIES
// ============================================

/**
 * Get a player's private hand
 */
export async function getPrivateHand(
  roomCode: string,
  seat: SeatIndex
): Promise<PrivateHand | null> {
  const snapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as PrivateHand;
}

/**
 * Get game state
 */
export async function getGameState(roomCode: string): Promise<GameState | null> {
  const snapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameState;
}

// ============================================
// WIN DETECTION - PHASE 6
// ============================================

/**
 * Check if a player can declare a win with their current hand
 * Must have the right number of tiles that form the required sets + 1 pair
 * @param exposedMeldCount - Number of exposed melds (reduces required concealed tiles)
 */
export function canWin(hand: TileId[], goldTileType: TileType, exposedMeldCount: number = 0): boolean {
  return canFormWinningHand(hand, goldTileType, exposedMeldCount);
}

/**
 * Declare a win (self-draw)
 * Called when player draws a winning tile
 */
export async function declareSelfDrawWin(
  roomCode: string,
  seat: SeatIndex
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify it's this player's turn
  if (gameState.currentPlayerSeat !== seat) {
    return { success: false, error: 'Not your turn' };
  }

  // Get current hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }

  const privateHand = handSnapshot.val() as PrivateHand;
  const hand = privateHand.concealedTiles;

  // Get exposed melds count
  const exposedMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
  const exposedMeldCount = exposedMelds.length;

  // Verify hand has correct number of tiles (after draw, before discard)
  // With N exposed melds: 17 - 3*N concealed tiles
  const expectedHandSize = 17 - (3 * exposedMeldCount);
  if (hand.length !== expectedHandSize) {
    return { success: false, error: 'Invalid hand size for win' };
  }

  // Check if hand is a winning hand
  if (!canFormWinningHand(hand, gameState.goldTileType, exposedMeldCount)) {
    return { success: false, error: 'Hand is not a winning hand' };
  }

  // Calculate score
  const bonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];
  const goldCount = countGoldTiles(hand, gameState.goldTileType);

  // Get dealer streak bonus (only if winner is dealer)
  const currentStreak = await getDealerStreak(roomCode);
  const dealerStreakBonus = (seat === gameState.dealerSeat && currentStreak > 0) ? currentStreak : 0;

  const base = 1;
  const bonusCount = bonusTiles.length;
  const subtotal = base + bonusCount + goldCount + dealerStreakBonus;
  const multiplier = 2; // Self-draw multiplier

  // Special bonuses (added after multiplier)
  const goldenPairBonus = hasGoldenPair(hand, gameState.goldTileType, exposedMeldCount) ? 30 : 0;
  const noBonusBonus = bonusCount === 0 ? 10 : 0;

  const total = (subtotal * multiplier) + goldenPairBonus + noBonusBonus;

  // Get the winning tile (the tile that was just drawn)
  const winningTile = gameState.lastAction?.type === 'draw' ? gameState.lastAction.tile : undefined;

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat,
      isSelfDraw: true,
      isThreeGolds: false,
      isRobbingGold: false,
      hand,
      ...(winningTile ? { winningTile } : {}),
      score: {
        base,
        bonusTiles: bonusCount,
        golds: goldCount,
        dealerStreakBonus,
        subtotal,
        multiplier,
        ...(goldenPairBonus > 0 ? { goldenPairBonus } : {}),
        ...(noBonusBonus > 0 ? { noBonusBonus } : {}),
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Log the win
  await addToLog(roomCode, `${SEAT_NAMES[seat]} wins by self-draw! Score: ${total}`);

  // Record round result for cumulative scoring
  const winnerName = await getPlayerName(roomCode, seat);
  await recordRoundResult(roomCode, seat, winnerName, total, gameState.dealerSeat);

  return { success: true };
}

/**
 * Check if player can win on a discarded tile
 * @param exposedMeldCount - Number of exposed melds (reduces required concealed tiles)
 */
export function canWinOnDiscard(
  hand: TileId[],
  discardedTile: TileId,
  goldTileType: TileType,
  exposedMeldCount: number = 0
): boolean {
  // Just check if hand + discard can form a winning hand
  // No hand size check - let canFormWinningHand validate the structure
  const testHand = [...hand, discardedTile];
  return canFormWinningHand(testHand, goldTileType, exposedMeldCount);
}

/**
 * Declare a win on discard (ron)
 */
export async function declareDiscardWin(
  roomCode: string,
  winnerSeat: SeatIndex,
  discardedTile: TileId,
  discarderSeat: SeatIndex
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify discard was just made
  if (
    !gameState.lastAction ||
    gameState.lastAction.type !== 'discard' ||
    gameState.lastAction.tile !== discardedTile ||
    gameState.lastAction.playerSeat !== discarderSeat
  ) {
    return { success: false, error: 'Cannot win on this discard' };
  }

  // Get winner's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${winnerSeat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }

  const privateHand = handSnapshot.val() as PrivateHand;
  const hand = privateHand.concealedTiles;

  // Get exposed melds count
  const exposedMelds = gameState.exposedMelds?.[`seat${winnerSeat}` as keyof typeof gameState.exposedMelds] || [];
  const exposedMeldCount = exposedMelds.length;

  // Verify hand has correct number of tiles (waiting for winning tile)
  // With N exposed melds: 16 - 3*N concealed tiles
  const expectedHandSize = 16 - (3 * exposedMeldCount);
  if (hand.length !== expectedHandSize) {
    return { success: false, error: 'Invalid hand size for win' };
  }

  // Check if hand + discarded tile forms winning hand
  const fullHand = [...hand, discardedTile];
  if (!canFormWinningHand(fullHand, gameState.goldTileType, exposedMeldCount)) {
    return { success: false, error: 'Hand is not a winning hand' };
  }

  // Check Gold discard penalty (if winner discarded Gold, they can only self-draw)
  // TODO: Track Gold discard history per player

  // Calculate score
  const bonusTiles = gameState.bonusTiles?.[`seat${winnerSeat}` as keyof typeof gameState.bonusTiles] || [];
  const goldCount = countGoldTiles(fullHand, gameState.goldTileType);

  // Get dealer streak bonus (only if winner is dealer)
  const currentStreak = await getDealerStreak(roomCode);
  const dealerStreakBonus = (winnerSeat === gameState.dealerSeat && currentStreak > 0) ? currentStreak : 0;

  const base = 1;
  const bonusCount = bonusTiles.length;
  const subtotal = base + bonusCount + goldCount + dealerStreakBonus;
  const multiplier = 1; // Discard win (no self-draw multiplier)

  // Special bonuses (added after multiplier)
  const goldenPairBonus = hasGoldenPair(fullHand, gameState.goldTileType, exposedMeldCount) ? 30 : 0;
  const noBonusBonus = bonusCount === 0 ? 10 : 0;

  const total = (subtotal * multiplier) + goldenPairBonus + noBonusBonus;

  // Remove discarded tile from discard pile
  const discardPile = [...(gameState.discardPile || [])];
  const discardIndex = discardPile.lastIndexOf(discardedTile);
  if (discardIndex !== -1) {
    discardPile.splice(discardIndex, 1);
  }

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    discardPile,
    winner: {
      seat: winnerSeat,
      isSelfDraw: false,
      isThreeGolds: false,
      isRobbingGold: false,
      winningTile: discardedTile,
      discarderSeat,
      hand: fullHand,
      score: {
        base,
        bonusTiles: bonusCount,
        golds: goldCount,
        dealerStreakBonus,
        subtotal,
        multiplier,
        ...(goldenPairBonus > 0 ? { goldenPairBonus } : {}),
        ...(noBonusBonus > 0 ? { noBonusBonus } : {}),
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Log the win
  const tileName = getTileDisplayText(getTileType(discardedTile));
  await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} wins on ${SEAT_NAMES[discarderSeat]}'s discard (${tileName})! Score: ${total}`);

  // Record round result for cumulative scoring
  const winnerName = await getPlayerName(roomCode, winnerSeat);
  await recordRoundResult(roomCode, winnerSeat, winnerName, total, gameState.dealerSeat);

  return { success: true };
}
