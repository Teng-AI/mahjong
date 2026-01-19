import { ref, set, get, update, runTransaction, serverTimestamp } from 'firebase/database';
import { db } from '@/firebase/config';
import {
  TileId,
  TileType,
  SeatIndex,
  GameState,
  PrivateHand,
  CallAction,
  PendingCalls,
  ChowOption,
  Meld,
  GameRound,
  SessionScores,
  RoomSettings,
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
  canKong,
  canWinOnDiscard as canWinOnDiscardValidation,
  validateChowSelection,
  hasGoldenPair,
  isAllOneSuit,
  getWinningTiles,
  selectSafeDiscard,
} from './tiles';

// Seat labels for log messages
const SEAT_NAMES = ['East', 'South', 'West', 'North'] as const;

// TEST MODE: Set to true to deal a winning hand to the dealer
const TEST_WINNING_HAND = false;

// TEST MODE: Set to true to set up hands for testing Kong functionality
// Dealer gets: 4 identical tiles (concealed kong), 3 matching tiles (for pung->upgrade)
// Seat 1 gets: 3 identical tiles (ready to call kong on discard)
const TEST_KONG_MODE = false;

// TEST MODE: Set to true to test turn timer auto-win
// Dealer gets: 2 gold tiles + near-winning hand (3 sequences + pair + isolated tiles)
// Gold tile is forced to be dots_7
// After drawing any tile, should auto-win when timer expires
const TEST_TIMER_WIN_MODE = false;
const DEBUG_AUTO_PLAY = false; // Set to true to debug auto-play on turn timer expire

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

/**
 * Archive the current game's action log to session storage
 * Called when a round completes (win or draw)
 */
async function archiveGameLog(roomCode: string, roundNumber: number): Promise<void> {
  const logSnapshot = await get(ref(db, `rooms/${roomCode}/game/actionLog`));
  const actionLog: string[] = logSnapshot.exists() ? logSnapshot.val() : [];

  if (actionLog.length > 0) {
    await set(ref(db, `rooms/${roomCode}/session/gameLogs/${roundNumber}`), actionLog);
  }
}

// ============================================
// SESSION SCORING
// ============================================

/**
 * Record a round result in the session scores
 * Called when a game ends (win or draw)
 * Updates dealer streak: increments if dealer won OR draw (dealer stays), resets to 0 if dealer lost
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
  // Increment if dealer won OR draw (dealer stays), reset to 0 if dealer lost
  const currentStreak = session.dealerStreak || 0;
  const newStreak = (winnerSeat === dealerSeat || winnerSeat === null) ? currentStreak + 1 : 0;

  // Save updated session
  await update(ref(db, `rooms/${roomCode}/session`), {
    rounds: [...(session.rounds || []), round],
    cumulative: newCumulative,
    dealerStreak: newStreak,
  });

  // Archive the game log for this round
  await archiveGameLog(roomCode, roundNumber);
}

/**
 * Adjust session scores (host only)
 * Stores adjustments separately so they're additive to computed values
 */
export async function adjustCumulativeScores(
  roomCode: string,
  adjustments: Record<number, number>
): Promise<void> {
  // Get current session
  const sessionSnapshot = await get(ref(db, `rooms/${roomCode}/session`));

  if (!sessionSnapshot.exists()) {
    throw new Error('No session data to adjust');
  }

  const session = sessionSnapshot.val() as SessionScores;
  const currentAdjustments = session.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
  const newAdjustments = { ...currentAdjustments };

  // Apply new adjustments on top of existing
  for (const [seatStr, adjustment] of Object.entries(adjustments)) {
    const seatKey = `seat${seatStr}` as keyof typeof newAdjustments;
    newAdjustments[seatKey] = (newAdjustments[seatKey] || 0) + adjustment;
  }

  // Save updated adjustments
  await update(ref(db, `rooms/${roomCode}/session`), {
    adjustments: newAdjustments,
  });

  // Log the adjustment with player names and amounts
  const adjustmentParts: string[] = [];
  for (const [seatStr, adjustment] of Object.entries(adjustments)) {
    if (adjustment !== 0) {
      const playerName = await getPlayerName(roomCode, parseInt(seatStr) as SeatIndex);
      const sign = adjustment > 0 ? '+' : '';
      adjustmentParts.push(`${playerName} ${sign}${adjustment}`);
    }
  }

  if (adjustmentParts.length > 0) {
    await addToLog(roomCode, `Host adjusted: ${adjustmentParts.join(', ')}`);
  }
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
 * Returns the number of consecutive rounds kept by the current dealer (0 if none)
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
  // Clear ready state from previous round
  await clearReadyState(roomCode);

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
  } else if (TEST_KONG_MODE) {
    // TEST MODE: Set up hands for testing Kong keyboard selection
    // Dealer gets: 2 concealed kongs (8 tiles) + triple (3 tiles) + scattered (6 tiles) = 17 tiles
    // Seat 1 has the 4th tile of dealer's triple (will discard it so dealer can pung then upgrade)

    const dealerHand: TileId[] = [
      // Concealed Kong #1: 4x dots_1
      'dots_1_0', 'dots_1_1', 'dots_1_2', 'dots_1_3',
      // Concealed Kong #2: 4x bamboo_5
      'bamboo_5_0', 'bamboo_5_1', 'bamboo_5_2', 'bamboo_5_3',
      // Triple (for pung->upgrade): 3x characters_3 (seat1 has the 4th)
      'characters_3_0', 'characters_3_1', 'characters_3_2',
      // Scattered tiles (6 tiles to reach 17)
      'dots_4_0', 'dots_7_0', 'bamboo_2_0', 'characters_8_0', 'wind_east_0', 'wind_south_0',
    ];

    const seat1Hand: TileId[] = [
      // Give seat1 pairs and sequences so they KEEP everything except characters_3_3
      // 4 PAIRS (valuable - bot keeps)
      'dots_2_0', 'dots_2_2',
      'bamboo_7_0', 'bamboo_7_2',
      'bamboo_9_0', 'bamboo_9_2',
      'wind_north_0', 'wind_north_2',
      // SEQUENCE POTENTIAL (valuable)
      'dots_5_0', 'dots_6_2', 'dots_8_0', // 5,6,8 shape
      'bamboo_1_0', 'bamboo_3_0',         // 1,3 waiting for 2
      // ANOTHER PAIR
      'dragon_red_0', 'dragon_red_2',
      // ISOLATED - bot will discard this (only char tile, no pair, no sequence)
      'characters_3_3',
    ];

    const seat2Hand: TileId[] = [
      // Scattered tiles (16 tiles)
      'dots_2_1', 'dots_3_1', 'dots_5_1', 'dots_6_0',
      'bamboo_1_1', 'bamboo_2_1', 'bamboo_4_0', 'bamboo_8_0',
      'characters_1_1', 'characters_2_0', 'characters_4_0', 'characters_6_0',
      'wind_east_1', 'wind_south_1', 'wind_west_1', 'wind_north_1',
    ];

    const seat3Hand: TileId[] = [
      // Scattered tiles (16 tiles)
      'dots_6_1', 'dots_8_1', 'dots_9_0', 'dots_9_1',
      'bamboo_3_1', 'bamboo_4_1', 'bamboo_6_0', 'bamboo_6_1',
      'characters_2_1', 'characters_4_1', 'characters_6_1', 'characters_8_1',
      'dragon_green_0', 'dragon_white_0', 'dragon_red_1', 'dragon_green_1',
    ];

    // Remove test tiles from shuffled deck
    const usedTiles = new Set([...dealerHand, ...seat1Hand, ...seat2Hand, ...seat3Hand]);
    shuffledTiles = shuffledTiles.filter(t => !usedTiles.has(t));

    // Assign hands based on dealer position
    hands[dealerSeat] = dealerHand;
    hands[((dealerSeat + 1) % 4) as SeatIndex] = seat1Hand;
    hands[((dealerSeat + 2) % 4) as SeatIndex] = seat2Hand;
    hands[((dealerSeat + 3) % 4) as SeatIndex] = seat3Hand;

    // Wall is the remaining shuffled tiles
    shuffledTiles = shuffledTiles.slice(0);
    tileIndex = 0; // Reset for wall creation
  } else if (TEST_TIMER_WIN_MODE) {
    // TEST MODE: Set up hands for testing turn timer auto-win
    // In this variant, winning hand = 5 melds + 1 pair = 17 tiles
    // Dealer starts with 17, discards 1, then draws to 17 and wins

    // Setup: 4 complete sequences + 1 pair + gold + 1 partial + 1 junk
    // After discarding junk and drawing matching tile:
    // 4 sequences + gold-assisted pung + pair = 5 melds + pair = WIN

    // NOTE: Gold tile is forced to dots_7 below
    // Hand requires gold to win - won't trigger "rob the gold"
    const dealerHand: TileId[] = [
      // 1 GOLD TILE (dots_7)
      'dots_7_0',
      // Sequence 1: 1-2-3萬
      'characters_1_0', 'characters_2_0', 'characters_3_0',
      // Sequence 2: 4-5-6萬
      'characters_4_0', 'characters_5_0', 'characters_6_0',
      // Sequence 3: 7-8-9萬
      'characters_7_0', 'characters_8_0', 'characters_9_0',
      // Pair (eyes): 5|| 5||
      'bamboo_5_0', 'bamboo_5_1',
      // Isolated circles (can't form meld)
      'dots_3_0', 'dots_6_0',
      // Partial pung: 3|| 3|| (needs drawn tile bamboo_3_2)
      'bamboo_3_0', 'bamboo_3_1',
      // Junk tile to discard
      'bamboo_6_0',
    ]; // 17 tiles - 3 seq + partial pung + pair + 2 isolated + gold + junk
    // This hand WON'T auto-win (dots_3 + dots_6 can't form meld with gold)
    // Test verifies: no rob-the-gold, auto-discard works

    const seat1Hand: TileId[] = [
      'characters_1_1', 'characters_2_1', 'characters_3_1',
      'characters_4_1', 'characters_5_1', 'characters_6_1',
      'characters_7_1', 'characters_8_1', 'characters_9_1',
      'dots_1_0', 'dots_4_0', 'dots_5_0', 'dots_6_0',
      'bamboo_2_0', 'bamboo_4_0', 'bamboo_5_0',
    ];

    const seat2Hand: TileId[] = [
      'characters_1_2', 'characters_2_2', 'characters_3_2',
      'characters_4_2', 'characters_5_2', 'characters_6_2',
      'characters_7_2', 'characters_8_2', 'characters_9_2',
      'dots_1_1', 'dots_4_1', 'dots_5_1', 'dots_6_1',
      'bamboo_2_1', 'bamboo_4_1', 'bamboo_5_1',
    ];

    const seat3Hand: TileId[] = [
      'characters_1_3', 'characters_2_3', 'characters_3_3',
      'characters_4_3', 'characters_5_3', 'characters_6_3',
      'characters_7_3', 'characters_8_3', 'characters_9_3',
      'dots_1_2', 'dots_4_2', 'dots_5_2', 'dots_6_2',
      'bamboo_2_2', 'bamboo_4_2', 'bamboo_5_2',
    ];

    // Remove test tiles from shuffled deck
    const usedTiles = new Set([...dealerHand, ...seat1Hand, ...seat2Hand, ...seat3Hand]);
    shuffledTiles = shuffledTiles.filter(t => !usedTiles.has(t));

    // Put winning tile at position 3 in wall (4th tile)
    // After dealer's discard, bots draw 3 tiles, then dealer draws the 4th
    // bamboo_3_2 completes dealer's bamboo_3_0 + bamboo_3_1 into a pung
    // Then gold completes dots_1_0 + dots_1_1 into another pung -> 5 melds + pair = WIN
    const winningTile = 'bamboo_3_2' as TileId;
    const winIndex = shuffledTiles.indexOf(winningTile);
    if (winIndex !== -1 && winIndex !== 3) {
      shuffledTiles.splice(winIndex, 1);
      // Insert at position 3
      shuffledTiles.splice(3, 0, winningTile);
    }

    // Assign hands based on dealer position
    hands[dealerSeat] = dealerHand;
    hands[((dealerSeat + 1) % 4) as SeatIndex] = seat1Hand;
    hands[((dealerSeat + 2) % 4) as SeatIndex] = seat2Hand;
    hands[((dealerSeat + 3) % 4) as SeatIndex] = seat3Hand;

    tileIndex = 0; // Reset for wall creation
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
  let wall = (TEST_WINNING_HAND || TEST_KONG_MODE || TEST_TIMER_WIN_MODE)
    ? shuffledTiles // Already set up correctly in test modes
    : shuffledTiles.slice(tileIndex);

  // Remove 16 tiles as dead wall (unplayable, per Fujian Mahjong rules)
  if (!TEST_WINNING_HAND && !TEST_KONG_MODE && !TEST_TIMER_WIN_MODE) {
    wall = wall.slice(0, -16);
  }

  // Auto-expose bonus tiles for all players, starting from dealer
  const bonusTiles: TileId[][] = [[], [], [], []];
  const actionLog: string[] = ['Game started'];

  // Process each player starting from dealer
  for (let i = 0; i < 4; i++) {
    const seat = ((dealerSeat + i) % 4) as SeatIndex;
    let playerHand = hands[seat];
    let bonusTilesInHand = playerHand.filter(isBonusTile);

    while (bonusTilesInHand.length > 0 && wall.length > 0) {
      // Move all bonus tiles to exposed
      for (const bonusTile of bonusTilesInHand) {
        bonusTiles[seat].push(bonusTile);
        playerHand = playerHand.filter(t => t !== bonusTile);

        // Draw replacement from wall
        if (wall.length > 0) {
          const replacement = wall.shift()!;
          playerHand.push(replacement);
        }
      }

      // Check for more bonus tiles in the replacements
      bonusTilesInHand = playerHand.filter(isBonusTile);
    }

    hands[seat] = playerHand;

    // Log bonus exposure
    if (bonusTiles[seat].length > 0) {
      const bonusNames = bonusTiles[seat].map(t => getTileDisplayText(getTileType(t))).join(', ');
      actionLog.push(`${SEAT_NAMES[seat]} exposed bonus: ${bonusNames}`);
    } else {
      actionLog.push(`${SEAT_NAMES[seat]} had no bonus tiles`);
    }
  }

  // Reveal Gold tile (handle bonus tiles going to dealer)
  let exposedGold: TileId;

  if (TEST_TIMER_WIN_MODE) {
    // Force gold tile to be dots_7 for testing
    // Find dots_7_2 or dots_7_3 in wall (0 and 1 are in dealer's hand)
    const goldIndex = wall.findIndex(t => t.startsWith('dots_7_'));
    if (goldIndex !== -1) {
      exposedGold = wall[goldIndex];
      wall.splice(goldIndex, 1);
    } else {
      exposedGold = 'dots_7_2' as TileId; // Fallback
    }
  } else {
    exposedGold = wall.shift()!;
    while (isBonusTile(exposedGold) && wall.length > 0) {
      // Bonus tile goes to dealer
      bonusTiles[dealerSeat].push(exposedGold);
      const bonusName = getTileDisplayText(getTileType(exposedGold));
      actionLog.push(`Dealer received bonus from Gold reveal: ${bonusName}`);
      exposedGold = wall.shift()!;
    }
  }

  const goldTileType = getTileType(exposedGold);
  actionLog.push(`Gold tile revealed: ${getTileDisplayText(goldTileType)}`);

  // Sort all hands now that Gold is known
  for (let seat = 0; seat < 4; seat++) {
    hands[seat] = sortTilesForDisplay(hands[seat], goldTileType);
  }

  // Get room settings for turn timer
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;
  const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

  // Create initial game state (Gold revealed, ready to play)
  const gameState: GameState = {
    phase: 'playing', // Skip bonus_exposure phase
    goldTileType,
    exposedGold,
    wall,
    discardPile: [],
    currentPlayerSeat: dealerSeat,
    dealerSeat,
    lastAction: null,
    previousAction: null,
    exposedMelds: {
      seat0: [],
      seat1: [],
      seat2: [],
      seat3: [],
    },
    bonusTiles: {
      seat0: bonusTiles[0],
      seat1: bonusTiles[1],
      seat2: bonusTiles[2],
      seat3: bonusTiles[3],
    },
    pendingCalls: null,
    winner: null,
    actionLog,
    // Turn timer settings
    turnStartTime: Date.now(), // Dealer's turn starts now
    turnTimerSeconds,
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

  // Check all players for Three Golds instant win
  for (let seat = 0; seat < 4; seat++) {
    const goldCount = countGoldTiles(hands[seat], goldTileType);
    if (goldCount === 3) {
      // Three Golds! Instant win - handle it after init completes
      await handleThreeGoldsWin(roomCode, seat as SeatIndex, hands[seat], goldTileType);
      return;
    }
  }

  // Check for Robbing the Gold (抢金) after Gold tile is revealed
  const robbingGoldResult = await checkRobbingGold(roomCode, goldTileType, exposedGold, dealerSeat);
  if (robbingGoldResult !== null) {
    return; // Game ended with Robbing Gold win
  }

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
  const wall = [...(gameState.wall || [])];
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
  // Get bonus tiles and melds for scoring
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;
  const bonusTiles = gameState.bonusTiles?.[`seat${winnerSeat}` as keyof typeof gameState.bonusTiles] || [];
  const exposedMelds = gameState.exposedMelds?.[`seat${winnerSeat}` as keyof typeof gameState.exposedMelds] || [];

  // Get dealer streak bonus (only if winner is dealer)
  const currentStreak = await getDealerStreak(roomCode);
  const dealerStreakBonus = (winnerSeat === gameState.dealerSeat && currentStreak > 0) ? currentStreak : 0;

  // Kong bonuses: concealed +2, exposed +1
  const kongBonuses = countKongBonuses(exposedMelds);
  const concealedKongBonus = kongBonuses.concealed * 2;
  const exposedKongBonus = kongBonuses.exposed * 1;

  // Calculate score
  const base = 1;
  const bonusCount = bonusTiles.length;
  const goldCount = 3;
  const subtotal = base + bonusCount + goldCount + concealedKongBonus + exposedKongBonus + dealerStreakBonus;
  const multiplier = 2; // Self-draw (Three Golds always counts as self-draw)
  const threeGoldsBonus = 30;
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
        concealedKongBonus,
        exposedKongBonus,
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
  const robbingGoldBonus = 30;

  // Check for special bonuses
  const goldenPairBonus = hasGoldenPair(hand, goldTileType, 0) ? 50 : 0;
  // No Bonus/Kong: +15 for no bonus tiles AND no kongs (no kongs possible at game start)
  const noBonusBonus = bonusCount === 0 ? 15 : 0;

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

  // After Pung, Chow, or Kong call, skip draw (caller already has 17/18 tiles)
  // For Kong, the replacement draw already happened
  if (
    (gameState.lastAction?.type === 'pung' ||
     gameState.lastAction?.type === 'chow' ||
     gameState.lastAction?.type === 'kong') &&
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

  const wall = [...(gameState.wall || [])];

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

  // Log the draw action (drew first, then exposed bonus if any)
  // Format: "East drew a tile [PRIVATE:0:7竹]" - the [PRIVATE:seat:tile] part is only shown to that player
  const drawnTileDisplay = getTileDisplayText(getTileType(drawnTile));
  await addToLog(roomCode, `${SEAT_NAMES[seat]} drew a tile [PRIVATE:${seat}:${drawnTileDisplay}]`);
  if (bonusTilesExposed.length > 0) {
    const bonusNames = bonusTilesExposed.map(t => getTileDisplayText(getTileType(t))).join(', ');
    await addToLog(roomCode, `${SEAT_NAMES[seat]} exposed bonus: ${bonusNames}`);
  }

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

  // Get room settings
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;

  // FUJIAN MAHJONG RULE: When wall has 4 or fewer tiles, skip calling phase
  // Each player gets one final draw attempt, only self-draw wins allowed
  const wallLength = gameState.wall?.length || 0;
  if (wallLength <= 4) {
    const nextSeat = getNextSeat(seat);
    const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

    // Skip calling phase - directly advance to next player
    const updateData: Record<string, unknown> = {
      discardPile,
      phase: 'playing',
      currentPlayerSeat: nextSeat,
      pendingCalls: null,
      pendingChowOption: null,
      turnStartTime: serverTimestamp(),
      turnTimerSeconds,
      lastAction: {
        type: 'discard',
        playerSeat: seat,
        tile: tileId,
        timestamp: Date.now(),
      },
    };
    if (gameState.lastAction) {
      updateData.previousAction = gameState.lastAction;
    }
    await update(ref(db, `rooms/${roomCode}/game`), updateData);

    // Update private hand
    await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
      concealedTiles: currentHand,
    });

    // Log the discard
    const tileName = getTileDisplayText(getTileType(tileId));
    await addToLog(roomCode, `${SEAT_NAMES[seat]} discarded ${tileName}`);

    return { success: true };
  }

  // Normal flow: enter calling phase
  const callingTimerSeconds = settings?.callingTimerSeconds ?? null;

  // Initialize pending calls - discarder is marked, others are 'waiting'
  // IMPORTANT: Use 'waiting' instead of null because Firebase doesn't store null values,
  // which would cause stale data from previous phases to persist
  const pendingCalls: PendingCalls = {
    seat0: seat === 0 ? 'discarder' : 'waiting',
    seat1: seat === 1 ? 'discarder' : 'waiting',
    seat2: seat === 2 ? 'discarder' : 'waiting',
    seat3: seat === 3 ? 'discarder' : 'waiting',
  };

  // Use set() for pendingCalls to atomically replace (not merge) the object
  // This prevents stale data from previous calling phases
  await set(ref(db, `rooms/${roomCode}/game/pendingCalls`), pendingCalls);

  // Update game state - enter calling phase
  // Save current lastAction as previousAction (e.g., draw or call before discard)
  const updateData: Record<string, unknown> = {
    discardPile,
    phase: 'calling',
    // Increment callingPhaseId to detect stale responses
    callingPhaseId: (gameState.callingPhaseId || 0) + 1,
    // Server timestamp for timer calculation (survives disconnects)
    callingPhaseStartTime: serverTimestamp(),
    // Copy timer setting to this phase (won't change if host changes setting mid-phase)
    callingTimerSeconds,
    lastAction: {
      type: 'discard',
      playerSeat: seat,
      tile: tileId,
      timestamp: Date.now(),
    },
  };
  // Only set previousAction if there was a lastAction (not on dealer's first discard)
  if (gameState.lastAction) {
    updateData.previousAction = gameState.lastAction;
  }
  await update(ref(db, `rooms/${roomCode}/game`), updateData);

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

  // Record draw result (0 score, no winner) - increments dealer streak
  await recordRoundResult(roomCode, null, 'Draw', 0, dealerSeat);
}

/**
 * Force-abort the current game (host only)
 * - Ends the game without recording a round result
 * - Session scores remain unchanged (pretend this game didn't happen)
 * - Dealer and dealer streak stay the same
 */
export async function abortGame(roomCode: string): Promise<{ success: boolean; error?: string }> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Only allow aborting active games
  if (gameState.phase === 'ended' || gameState.phase === 'waiting') {
    return { success: false, error: 'Game is not active' };
  }

  // End the game without recording a round
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: null,
    pendingCalls: null,
    pendingChowOption: null,
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Log the abort
  await addToLog(roomCode, 'Game aborted by host');

  // NOTE: We deliberately do NOT call recordRoundResult here
  // This keeps session scores unchanged (as if this game never happened)

  return { success: true };
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
  // 'waiting' means no response yet, any other value means already responded
  const currentCall = gameState.pendingCalls?.[`seat${seat}` as keyof PendingCalls];
  if (currentCall && currentCall !== 'waiting') {
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
    if (!canPung(hand, discardTile, gameState.goldTileType)) {
      return { success: false, error: 'Cannot pung this tile' };
    }
  } else if (action === 'kong') {
    if (!canKong(hand, discardTile, gameState.goldTileType)) {
      return { success: false, error: 'Cannot kong this tile' };
    }
  } else if (action === 'chow') {
    if (!isNextInTurn) {
      return { success: false, error: 'Only next player can chow' };
    }
    if (!chowTiles) {
      return { success: false, error: 'Chow tiles required' };
    }
    const chowOption = validateChowSelection(hand, discardTile, chowTiles, gameState.goldTileType);
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

    // Check if all have responded ('waiting' means not yet responded)
    const allResponded = ([0, 1, 2, 3] as SeatIndex[]).every(s => {
      const call = currentCalls[`seat${s}`];
      return call && call !== 'waiting';
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
 * Priority: Win > Kong > Pung > Chow
 * Note: Kong and Pung are mutually exclusive (only 4 copies of any tile exist)
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
  const kongCallers: SeatIndex[] = [];
  const pungCallers: SeatIndex[] = [];
  let chowCaller: SeatIndex | null = null;

  for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
    const call = pendingCalls[`seat${seat}` as keyof PendingCalls];
    if (call === 'win') winCallers.push(seat);
    else if (call === 'kong') kongCallers.push(seat);
    else if (call === 'pung') pungCallers.push(seat);
    else if (call === 'chow') chowCaller = seat;
  }

  // Priority resolution: Win > Kong > Pung > Chow
  if (winCallers.length > 0) {
    // Handle win(s) - first in turn order from discarder wins
    const turnOrder = getTurnOrderFromDiscarder(discarderSeat);
    const winner = turnOrder.find(s => winCallers.includes(s))!;
    await executeWinCall(roomCode, winner, discardTile, discarderSeat);
    return;
  }

  if (kongCallers.length > 0) {
    // Take first kong caller (should only be one valid - needs 3 tiles in hand)
    await executeKongCall(roomCode, kongCallers[0], discardTile);
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

  // Get room settings for turn timer
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;
  const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'playing',
    currentPlayerSeat: nextSeat,
    pendingCalls: null,
    pendingChowOption: null,
    // Reset turn timer for next player
    turnStartTime: serverTimestamp(),
    turnTimerSeconds,
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

  // Get room settings for turn timer
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;
  const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

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
    // Start turn timer for caller (they need to discard)
    turnStartTime: serverTimestamp(),
    turnTimerSeconds,
  });

  // Update caller's hand (sorted)
  const sortedHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`), {
    concealedTiles: sortedHand,
  });

  const tileName = getTileDisplayText(getTileType(discardTile));
  await addToLog(roomCode, `${SEAT_NAMES[callerSeat]} called Peng on ${tileName}`);
}

/**
 * Execute a Kong call on discard
 * - Remove 3 matching tiles from hand
 * - Create 4-tile meld with discard
 * - Draw replacement tile from wall
 * - Caller becomes current player (must discard, no draw since replacement drawn)
 */
async function executeKongCall(
  roomCode: string,
  callerSeat: SeatIndex,
  discardTile: TileId
): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;

  // Get caller's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`));
  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Find 3 matching tiles in hand
  const discardType = getTileType(discardTile);
  const matchingTiles: TileId[] = [];
  const remainingHand: TileId[] = [];

  for (const tile of hand) {
    if (getTileType(tile) === discardType && matchingTiles.length < 3) {
      matchingTiles.push(tile);
    } else {
      remainingHand.push(tile);
    }
  }

  // Create kong meld (4 tiles)
  const meld: Meld = {
    type: 'kong',
    tiles: [matchingTiles[0], matchingTiles[1], matchingTiles[2], discardTile],
    calledTile: discardTile,
    isConcealed: false,
  };

  // Remove tile from discard pile
  const discardPile = [...gameState.discardPile];
  const discardIndex = discardPile.lastIndexOf(discardTile);
  if (discardIndex !== -1) {
    discardPile.splice(discardIndex, 1);
  }

  // Draw replacement tile from wall
  const wall = [...gameState.wall];
  let replacementTile: TileId | undefined;
  const bonusTilesExposed: TileId[] = [];

  // Keep drawing if we get bonus tiles
  while (wall.length > 0) {
    replacementTile = wall.shift()!;
    if (isBonusTile(replacementTile)) {
      bonusTilesExposed.push(replacementTile);
    } else {
      break;
    }
  }

  // Add replacement tile to hand
  if (replacementTile && !isBonusTile(replacementTile)) {
    remainingHand.push(replacementTile);
  }

  // Get existing melds and bonus tiles
  const existingMelds = gameState.exposedMelds?.[`seat${callerSeat}` as keyof typeof gameState.exposedMelds] || [];
  const existingBonusTiles = gameState.bonusTiles?.[`seat${callerSeat}` as keyof typeof gameState.bonusTiles] || [];

  // Get room settings for turn timer
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;
  const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'playing',
    currentPlayerSeat: callerSeat,
    wall,
    discardPile,
    pendingCalls: null,
    pendingChowOption: null,
    [`exposedMelds/seat${callerSeat}`]: [...existingMelds, meld],
    ...(bonusTilesExposed.length > 0 ? {
      [`bonusTiles/seat${callerSeat}`]: [...existingBonusTiles, ...bonusTilesExposed],
    } : {}),
    lastAction: {
      type: 'kong',
      playerSeat: callerSeat,
      tile: discardTile,
      replacementTile: replacementTile, // For highlighting the drawn tile
      timestamp: Date.now(),
    },
    // Start turn timer for caller (they need to discard)
    turnStartTime: serverTimestamp(),
    turnTimerSeconds,
  });

  // Update caller's hand (sorted)
  const sortedHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`), {
    concealedTiles: sortedHand,
  });

  const tileName = getTileDisplayText(getTileType(discardTile));
  await addToLog(roomCode, `${SEAT_NAMES[callerSeat]} called Gang on ${tileName}`);
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
  const remainingHand = [...hand];
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

  // Get room settings for turn timer
  const settingsSnapshot = await get(ref(db, `rooms/${roomCode}/settings`));
  const settings = settingsSnapshot.val() as RoomSettings | null;
  const turnTimerSeconds = settings?.turnTimerSeconds ?? null;

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
    // Start turn timer for caller (they need to discard)
    turnStartTime: serverTimestamp(),
    turnTimerSeconds,
  });

  // Update caller's hand (sorted)
  const sortedRemainingHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${callerSeat}`), {
    concealedTiles: sortedRemainingHand,
  });

  const tileName = getTileDisplayText(getTileType(discardTile));
  await addToLog(roomCode, `${SEAT_NAMES[callerSeat]} called Chi on ${tileName}`);
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

  // Kong bonuses: concealed +2, exposed +1
  const kongBonuses = countKongBonuses(exposedMelds);
  const concealedKongBonus = kongBonuses.concealed * 2;
  const exposedKongBonus = kongBonuses.exposed * 1;

  const base = 1;
  const bonusCount = bonusTiles.length;
  const subtotal = base + bonusCount + goldCount + concealedKongBonus + exposedKongBonus + dealerStreakBonus;

  // Check for All One Suit bonus
  const isFlush = isAllOneSuit(hand, exposedMelds, gameState.goldTileType);
  const allOneSuitBonus = isFlush ? 100 : 0;
  const multiplier = 2; // Self-draw multiplier (stacks with All One Suit)

  // Special bonuses (added after multiplier)
  const goldenPairBonus = hasGoldenPair(hand, gameState.goldTileType, exposedMeldCount) ? 50 : 0;
  // No Bonus/Kong: +15 for no bonus tiles AND no kongs
  const hasNoKongs = kongBonuses.concealed === 0 && kongBonuses.exposed === 0;
  const noBonusBonus = (bonusCount === 0 && hasNoKongs) ? 15 : 0;

  const total = (subtotal * multiplier) + goldenPairBonus + noBonusBonus + allOneSuitBonus;

  // Get the winning tile (the tile that was just drawn - either normal draw or kong replacement)
  let winningTile: TileId | undefined;
  if (gameState.lastAction?.type === 'draw' && gameState.lastAction.tile) {
    winningTile = gameState.lastAction.tile;
  } else if (gameState.lastAction?.type === 'kong' && gameState.lastAction.replacementTile) {
    winningTile = gameState.lastAction.replacementTile;
  }

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
        concealedKongBonus,
        exposedKongBonus,
        dealerStreakBonus,
        subtotal,
        multiplier,
        ...(goldenPairBonus > 0 ? { goldenPairBonus } : {}),
        ...(noBonusBonus > 0 ? { noBonusBonus } : {}),
        ...(allOneSuitBonus > 0 ? { allOneSuitBonus } : {}),
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Log the win
  const flushText = allOneSuitBonus > 0 ? ' (All One Suit!)' : '';
  await addToLog(roomCode, `${SEAT_NAMES[seat]} wins by self-draw${flushText}! Score: ${total}`);

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

  // Kong bonuses: concealed +2, exposed +1
  const kongBonuses = countKongBonuses(exposedMelds);
  const concealedKongBonus = kongBonuses.concealed * 2;
  const exposedKongBonus = kongBonuses.exposed * 1;

  const base = 1;
  const bonusCount = bonusTiles.length;
  const subtotal = base + bonusCount + goldCount + concealedKongBonus + exposedKongBonus + dealerStreakBonus;

  // Special bonuses (calculated first to determine multiplier)
  const goldenPairBonus = hasGoldenPair(fullHand, gameState.goldTileType, exposedMeldCount) ? 50 : 0;
  // No Bonus/Kong: +15 for no bonus tiles AND no kongs
  const hasNoKongs = kongBonuses.concealed === 0 && kongBonuses.exposed === 0;
  const noBonusBonus = (bonusCount === 0 && hasNoKongs) ? 15 : 0;
  // All One Suit bonus
  const isFlush = isAllOneSuit(fullHand, exposedMelds, gameState.goldTileType);
  const allOneSuitBonus = isFlush ? 100 : 0;

  // Special bonuses trigger ×2 multiplier even on discard wins
  const hasSpecialBonus = goldenPairBonus > 0 || noBonusBonus > 0 || allOneSuitBonus > 0;
  const multiplier = hasSpecialBonus ? 2 : 1;

  const total = (subtotal * multiplier) + goldenPairBonus + noBonusBonus + allOneSuitBonus;

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
        concealedKongBonus,
        exposedKongBonus,
        dealerStreakBonus,
        subtotal,
        multiplier,
        ...(goldenPairBonus > 0 ? { goldenPairBonus } : {}),
        ...(noBonusBonus > 0 ? { noBonusBonus } : {}),
        ...(allOneSuitBonus > 0 ? { allOneSuitBonus } : {}),
        total,
      },
    },
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });

  // Log the win
  const tileName = getTileDisplayText(getTileType(discardedTile));
  const flushText = allOneSuitBonus > 0 ? ' (All One Suit!)' : '';
  await addToLog(roomCode, `${SEAT_NAMES[winnerSeat]} wins on ${SEAT_NAMES[discarderSeat]}'s discard (${tileName})${flushText}! Score: ${total}`);

  // Record round result for cumulative scoring
  const winnerName = await getPlayerName(roomCode, winnerSeat);
  await recordRoundResult(roomCode, winnerSeat, winnerName, total, gameState.dealerSeat);

  return { success: true };
}

// ============================================
// KONG DECLARATIONS
// ============================================

/**
 * Helper to count kong bonuses from exposed melds
 */
function countKongBonuses(melds: Meld[]): { concealed: number; exposed: number } {
  let concealed = 0;
  let exposed = 0;
  for (const meld of melds) {
    if (meld.type === 'kong') {
      if (meld.isConcealed) {
        concealed++;
      } else {
        exposed++;
      }
    }
  }
  return { concealed, exposed };
}

/**
 * Declare a concealed Kong (4 of a kind in hand)
 * Can only be done during player's turn after drawing
 * - Remove 4 tiles from hand
 * - Create concealed kong meld
 * - Draw replacement tile
 * - Player must discard after
 */
export async function declareConcealedKong(
  roomCode: string,
  seat: SeatIndex,
  tileType: TileType
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify it's this player's turn and in playing phase
  if (gameState.phase !== 'playing') {
    return { success: false, error: 'Not in playing phase' };
  }
  if (gameState.currentPlayerSeat !== seat) {
    return { success: false, error: 'Not your turn' };
  }

  // Get player's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }

  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Find 4 matching tiles in hand
  const matchingTiles: TileId[] = [];
  const remainingHand: TileId[] = [];

  for (const tile of hand) {
    // Skip Gold tiles - cannot be used in kong
    if (isGoldTile(tile, gameState.goldTileType)) {
      remainingHand.push(tile);
      continue;
    }
    if (getTileType(tile) === tileType && matchingTiles.length < 4) {
      matchingTiles.push(tile);
    } else {
      remainingHand.push(tile);
    }
  }

  if (matchingTiles.length < 4) {
    return { success: false, error: 'Not enough tiles for kong' };
  }

  // Create concealed kong meld
  const meld: Meld = {
    type: 'kong',
    tiles: matchingTiles,
    isConcealed: true,
  };

  // Draw replacement tile from wall
  const wall = [...gameState.wall];
  let replacementTile: TileId | undefined;
  const bonusTilesExposed: TileId[] = [];

  // Keep drawing if we get bonus tiles
  while (wall.length > 0) {
    replacementTile = wall.shift()!;
    if (isBonusTile(replacementTile)) {
      bonusTilesExposed.push(replacementTile);
    } else {
      break;
    }
  }

  // Check for wall exhaustion
  if (!replacementTile || (isBonusTile(replacementTile) && wall.length === 0)) {
    // Game ends in draw
    await handleDrawGame(roomCode);
    return { success: true };
  }

  // Add replacement tile to hand
  remainingHand.push(replacementTile);

  // Get existing melds and bonus tiles
  const existingMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
  const existingBonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];

  // Update melds first (needed for kong bonus in Three Golds win)
  const newMelds = [...existingMelds, meld];
  await update(ref(db, `rooms/${roomCode}/game`), {
    wall,
    [`exposedMelds/seat${seat}`]: newMelds,
    ...(bonusTilesExposed.length > 0 ? {
      [`bonusTiles/seat${seat}`]: [...existingBonusTiles, ...bonusTilesExposed],
    } : {}),
  });

  // Check for Three Golds instant win
  const goldCount = countGoldTiles(remainingHand, gameState.goldTileType);
  if (goldCount === 3) {
    // Three Golds instant win!
    await handleThreeGoldsWin(roomCode, seat, remainingHand, gameState.goldTileType, replacementTile);
    return { success: true };
  }

  // Update game state with last action
  // Note: tile is intentionally omitted for concealed kong to prevent leaking info to other players
  await update(ref(db, `rooms/${roomCode}/game`), {
    lastAction: {
      type: 'kong',
      playerSeat: seat,
      // tile omitted - concealed kong tile should not be visible to other players
      replacementTile: replacementTile, // For highlighting the drawn tile
      isConcealed: true, // Flag to identify concealed kong in UI
      timestamp: Date.now(),
    },
    // Reset turn timer after kong (player still needs to discard)
    turnStartTime: serverTimestamp(),
  });

  // Update player's hand (sorted)
  const sortedHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
    concealedTiles: sortedHand,
  });

  // Log message hides the specific tile to prevent info leak
  await addToLog(roomCode, `${SEAT_NAMES[seat]} declared a concealed Gang`);

  return { success: true };
}

/**
 * Upgrade an exposed Pung to Kong
 * Can only be done during player's turn when they have the 4th tile
 * - Remove 1 tile from hand
 * - Convert pung meld to kong
 * - Draw replacement tile
 * - Player must discard after
 */
export async function upgradePungToKong(
  roomCode: string,
  seat: SeatIndex,
  meldIndex: number,
  tileFromHand: TileId
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Verify it's this player's turn and in playing phase
  if (gameState.phase !== 'playing') {
    return { success: false, error: 'Not in playing phase' };
  }
  if (gameState.currentPlayerSeat !== seat) {
    return { success: false, error: 'Not your turn' };
  }

  // Get existing melds
  const existingMelds = gameState.exposedMelds?.[`seat${seat}` as keyof typeof gameState.exposedMelds] || [];
  if (meldIndex < 0 || meldIndex >= existingMelds.length) {
    return { success: false, error: 'Invalid meld index' };
  }

  const meld = existingMelds[meldIndex];
  if (meld.type !== 'pung') {
    return { success: false, error: 'Can only upgrade pung to kong' };
  }

  // Get player's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }

  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Verify tile is in hand and matches pung
  const tileIndex = hand.indexOf(tileFromHand);
  if (tileIndex === -1) {
    return { success: false, error: 'Tile not in hand' };
  }

  const pungType = getTileType(meld.tiles[0]);
  if (getTileType(tileFromHand) !== pungType) {
    return { success: false, error: 'Tile does not match pung' };
  }

  // Gold tiles cannot be used
  if (isGoldTile(tileFromHand, gameState.goldTileType)) {
    return { success: false, error: 'Cannot use Gold tile for kong' };
  }

  // Remove tile from hand
  const remainingHand = [...hand];
  remainingHand.splice(tileIndex, 1);

  // Upgrade meld to kong
  const upgradedMeld: Meld = {
    type: 'kong',
    tiles: [...meld.tiles, tileFromHand],
    calledTile: meld.calledTile,
    isConcealed: false, // Upgraded from exposed pung
  };

  // Update melds array
  const newMelds = [...existingMelds];
  newMelds[meldIndex] = upgradedMeld;

  // Draw replacement tile from wall
  const wall = [...gameState.wall];
  let replacementTile: TileId | undefined;
  const bonusTilesExposed: TileId[] = [];

  // Keep drawing if we get bonus tiles
  while (wall.length > 0) {
    replacementTile = wall.shift()!;
    if (isBonusTile(replacementTile)) {
      bonusTilesExposed.push(replacementTile);
    } else {
      break;
    }
  }

  // Check for wall exhaustion
  if (!replacementTile || (isBonusTile(replacementTile) && wall.length === 0)) {
    // Game ends in draw
    await handleDrawGame(roomCode);
    return { success: true };
  }

  // Add replacement tile to hand
  remainingHand.push(replacementTile);

  // Get existing bonus tiles
  const existingBonusTiles = gameState.bonusTiles?.[`seat${seat}` as keyof typeof gameState.bonusTiles] || [];

  // Update melds first (needed for kong bonus in Three Golds win)
  await update(ref(db, `rooms/${roomCode}/game`), {
    wall,
    [`exposedMelds/seat${seat}`]: newMelds,
    ...(bonusTilesExposed.length > 0 ? {
      [`bonusTiles/seat${seat}`]: [...existingBonusTiles, ...bonusTilesExposed],
    } : {}),
  });

  // Check for Three Golds instant win
  const goldCount = countGoldTiles(remainingHand, gameState.goldTileType);
  if (goldCount === 3) {
    // Three Golds instant win!
    await handleThreeGoldsWin(roomCode, seat, remainingHand, gameState.goldTileType, replacementTile);
    return { success: true };
  }

  // Update game state with last action
  await update(ref(db, `rooms/${roomCode}/game`), {
    lastAction: {
      type: 'kong',
      playerSeat: seat,
      tile: tileFromHand,
      replacementTile: replacementTile, // For highlighting the drawn tile
      timestamp: Date.now(),
    },
    // Reset turn timer after kong (player still needs to discard)
    turnStartTime: serverTimestamp(),
  });

  // Update player's hand (sorted)
  const sortedHand = sortTilesForDisplay(remainingHand, gameState.goldTileType);
  await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
    concealedTiles: sortedHand,
  });

  const tileName = getTileDisplayText(pungType);
  await addToLog(roomCode, `${SEAT_NAMES[seat]} upgraded Peng to Gang (${tileName})`);

  return { success: true };
}

// ============================================
// TURN TIMER
// ============================================

/**
 * Auto-play a turn when the turn timer expires
 * Called by any client that detects the timer has expired for the current player
 *
 * This function handles:
 * 1. Drawing a tile (if needed)
 * 2. Selecting a safe tile to discard using selectSafeDiscard
 * 3. Discarding that tile
 *
 * Uses turnStartTime validation to prevent duplicate actions or stale triggers
 */
export async function autoPlayExpiredTurn(
  roomCode: string,
  seat: SeatIndex,
  expectedTurnStartTime: number
): Promise<{ success: boolean; error?: string }> {
  if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Starting', { roomCode, seat, expectedTurnStartTime });

  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Game not found');
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;
  if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Game state', {
    currentPlayerSeat: gameState.currentPlayerSeat,
    phase: gameState.phase,
    turnStartTime: gameState.turnStartTime,
  });

  // Validate it's still this player's turn
  if (gameState.currentPlayerSeat !== seat) {
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Not this player\'s turn');
    return { success: false, error: 'Not this player\'s turn' };
  }

  // Validate we're in playing phase
  if (gameState.phase !== 'playing') {
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Not in playing phase');
    return { success: false, error: 'Not in playing phase' };
  }

  // Validate the turn hasn't changed (turnStartTime matches what we expected)
  // Allow some tolerance for clock differences (within 1 second)
  const timeDiff = Math.abs((gameState.turnStartTime || 0) - expectedTurnStartTime);
  if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Time diff check', { timeDiff, expected: expectedTurnStartTime, actual: gameState.turnStartTime });
  if (timeDiff > 1000) {
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Turn already changed');
    return { success: false, error: 'Turn already changed' };
  }

  // Get player's hand
  const handSnapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  if (!handSnapshot.exists()) {
    return { success: false, error: 'Hand not found' };
  }

  const hand = (handSnapshot.val() as PrivateHand).concealedTiles;

  // Determine if player needs to draw first using the canonical needsToDraw function
  // This properly handles: dealer's first turn, after calls, after draws, etc.
  const needsDraw = needsToDraw(gameState);

  if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] needsDraw:', needsDraw, 'lastAction:', gameState.lastAction);

  if (needsDraw) {
    // Draw a tile first
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Drawing tile...');
    const drawResult = await drawTile(roomCode, seat);
    if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Draw result:', drawResult);
    if (!drawResult.success) {
      return { success: false, error: 'Failed to draw' };
    }

    // If draw resulted in game end (wall empty, three golds, etc.), we're done
    if (drawResult.wallEmpty || drawResult.threeGoldsWin) {
      return { success: true };
    }

    // Re-fetch game state and hand after draw (bonus tiles may have changed exposed melds)
    const [newGameSnapshot, newHandSnapshot] = await Promise.all([
      get(ref(db, `rooms/${roomCode}/game`)),
      get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`)),
    ]);

    if (newHandSnapshot.exists() && newGameSnapshot.exists()) {
      const newGameState = newGameSnapshot.val() as GameState;
      const newHand = (newHandSnapshot.val() as PrivateHand).concealedTiles;
      // Exposed melds are stored at gameState.exposedMelds.seatN, not gameState.players.seatN.exposedMelds
      const newExposedMelds = newGameState.exposedMelds?.[`seat${seat}` as keyof typeof newGameState.exposedMelds] || [];

      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] After draw - checking for win', {
        hand: newHand,
        handSize: newHand.length,
        exposedMelds: newExposedMelds,
        exposedMeldsCount: newExposedMelds.length,
        goldTileType: newGameState.goldTileType,
      });

      // Check if player has a winning hand - auto-declare win
      // canFormWinningHand(tiles, goldTileType, exposedMeldCount)
      const canWin = canFormWinningHand(newHand, newGameState.goldTileType, newExposedMelds.length);
      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] canFormWinningHand result:', canWin, 'for hand:', newHand.join(', '));

      if (canWin) {
        if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] AUTO-WIN! Declaring self-draw win');
        await declareSelfDrawWin(roomCode, seat);
        return { success: true };
      }

      // Select a safe tile to discard
      const tileToDiscard = selectSafeDiscard(newHand, newGameState.goldTileType, newGameState.discardPile);
      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Auto-discarding:', tileToDiscard);
      if (tileToDiscard) {
        await discardTile(roomCode, seat, tileToDiscard);
      }
    }
  } else {
    // Player has already drawn - re-fetch current game state for accurate data
    const currentGameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
    if (currentGameSnapshot.exists()) {
      const currentGameState = currentGameSnapshot.val() as GameState;
      // Exposed melds are stored at gameState.exposedMelds.seatN, not gameState.players.seatN.exposedMelds
      const currentExposedMelds = currentGameState.exposedMelds?.[`seat${seat}` as keyof typeof currentGameState.exposedMelds] || [];

      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Already drew - checking for win', {
        handSize: hand.length,
        exposedMeldsCount: currentExposedMelds.length,
        goldTileType: currentGameState.goldTileType,
      });

      // Check if they can win
      // canFormWinningHand(tiles, goldTileType, exposedMeldCount)
      const canWin = canFormWinningHand(hand, currentGameState.goldTileType, currentExposedMelds.length);
      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] canFormWinningHand result:', canWin);

      if (canWin) {
        if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] AUTO-WIN! Declaring self-draw win');
        await declareSelfDrawWin(roomCode, seat);
        return { success: true };
      }

      // Otherwise just discard
      const tileToDiscard = selectSafeDiscard(hand, currentGameState.goldTileType, currentGameState.discardPile);
      if (DEBUG_AUTO_PLAY) console.log('[autoPlayExpiredTurn] Auto-discarding:', tileToDiscard);
      if (tileToDiscard) {
        await discardTile(roomCode, seat, tileToDiscard);
      }
    }
  }

  return { success: true };
}

// ============================================
// CALLING PHASE TIMER
// ============================================

/**
 * Auto-pass a player when the calling phase timer expires
 * Called by any client that detects the timer has expired for a player
 * Uses phase ID validation to prevent duplicate passes or stale responses
 */
export async function autoPassExpiredTimer(
  roomCode: string,
  seat: SeatIndex,
  expectedPhaseId: number
): Promise<{ success: boolean; error?: string }> {
  // Get current game state
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    return { success: false, error: 'Game not found' };
  }

  const gameState = gameSnapshot.val() as GameState;

  // Validate we're still in the same calling phase
  if (gameState.callingPhaseId !== expectedPhaseId) {
    return { success: false, error: 'Phase already resolved' };
  }

  // Validate we're still in calling phase
  if (gameState.phase !== 'calling') {
    return { success: false, error: 'Not in calling phase' };
  }

  // Validate player hasn't already responded
  const currentCall = gameState.pendingCalls?.[`seat${seat}` as keyof PendingCalls];
  if (currentCall && currentCall !== 'waiting') {
    return { success: false, error: 'Already responded' };
  }

  // Submit pass for this player
  return submitCallResponse(roomCode, seat, 'pass');
}

// ============================================
// READY FOR NEXT ROUND SYSTEM
// ============================================

/**
 * Set a player's ready state for the next round
 */
export async function setReadyForNextRound(
  roomCode: string,
  seat: SeatIndex,
  ready: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await update(ref(db, `rooms/${roomCode}/readyForNextRound`), {
      [`seat${seat}`]: ready,
    });
    return { success: true };
  } catch (err) {
    console.error('Failed to set ready state:', err);
    return { success: false, error: 'Failed to update ready state' };
  }
}

/**
 * Initialize ready states when game ends (all players not ready)
 */
export async function initializeReadyState(roomCode: string): Promise<void> {
  await set(ref(db, `rooms/${roomCode}/readyForNextRound`), {
    seat0: false,
    seat1: false,
    seat2: false,
    seat3: false,
  });
}

/**
 * Clear ready states when starting a new round
 */
export async function clearReadyState(roomCode: string): Promise<void> {
  await set(ref(db, `rooms/${roomCode}/readyForNextRound`), null);
}
