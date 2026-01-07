import { ref, set, get, update } from 'firebase/database';
import { db } from '@/firebase/config';
import {
  TileId,
  TileType,
  SeatIndex,
  GameState,
  GamePhase,
  PrivateHand,
  Room,
} from '@/types';
import {
  generateAllTiles,
  shuffle,
  isBonusTile,
  getTileType,
  getTileDisplayText,
  countGoldTiles,
  sortTilesForDisplay,
} from './tiles';

// Seat labels for log messages
const SEAT_NAMES = ['East', 'South', 'West', 'North'] as const;

/**
 * Add an entry to the game action log
 */
async function addToLog(roomCode: string, message: string): Promise<void> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game/actionLog`));
  const currentLog: string[] = gameSnapshot.exists() ? gameSnapshot.val() : [];

  // Keep last 20 entries
  const newLog = [...currentLog, message].slice(-20);
  await set(ref(db, `rooms/${roomCode}/game/actionLog`), newLog);
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
  const shuffledTiles = shuffle(allTiles);

  // Deal tiles
  const hands: TileId[][] = [[], [], [], []];
  let tileIndex = 0;

  // Deal 16 tiles to each player
  for (let round = 0; round < 16; round++) {
    for (let seat = 0; seat < 4; seat++) {
      hands[seat].push(shuffledTiles[tileIndex++]);
    }
  }

  // Dealer gets 17th tile
  hands[dealerSeat].push(shuffledTiles[tileIndex++]);

  // Remaining tiles form the wall
  const wall = shuffledTiles.slice(tileIndex);

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
 */
export async function revealGoldTile(roomCode: string): Promise<{
  goldTileType: TileType;
  threeGoldsWinner: SeatIndex | null;
}> {
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  if (!gameSnapshot.exists()) {
    throw new Error('Game not found');
  }

  const gameState = gameSnapshot.val() as GameState;
  const wall = [...gameState.wall];

  // Flip tile from wall to determine Gold type
  const exposedGold = wall.shift()!;
  const goldTileType = getTileType(exposedGold);

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

  return { goldTileType, threeGoldsWinner };
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
  goldTileType: TileType
): Promise<void> {
  // Get bonus tiles for scoring
  const gameSnapshot = await get(ref(db, `rooms/${roomCode}/game`));
  const gameState = gameSnapshot.val() as GameState;
  const bonusTiles = gameState.bonusTiles[`seat${winnerSeat}` as keyof typeof gameState.bonusTiles] || [];

  // Calculate score
  const base = 1;
  const bonusCount = bonusTiles.length;
  const goldCount = 3;
  const subtotal = base + bonusCount + goldCount;
  const multiplier = 2; // Self-draw (Three Golds always counts as self-draw)
  const threeGoldsBonus = 20;
  const total = subtotal * multiplier + threeGoldsBonus;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat: winnerSeat,
      isSelfDraw: true,
      isThreeGolds: true,
      hand,
      score: {
        base,
        bonusTiles: bonusCount,
        golds: goldCount,
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
}

// ============================================
// TURN LOOP - PHASE 5
// ============================================

/**
 * Check if current player needs to draw (vs. discard)
 * - Dealer's first turn: skip draw (already has 17 tiles)
 * - After any discard: next player draws
 * - After drawing: same player discards
 */
export function needsToDraw(gameState: GameState): boolean {
  // If we just drew, we need to discard instead
  if (
    gameState.lastAction?.type === 'draw' &&
    gameState.lastAction.playerSeat === gameState.currentPlayerSeat
  ) {
    return false;
  }

  // Dealer's first turn after bonus exposure - already has 17 tiles
  // Note: lastAction may be undefined (not just null) from Firebase
  if (
    !gameState.lastAction ||
    gameState.lastAction.type === 'bonus_expose'
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
    // Three Golds win!
    await handleThreeGoldsWin(roomCode, seat, currentHand, gameState.goldTileType);
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
    await addToLog(roomCode, `${SEAT_NAMES[seat]} drew bonus (${bonusNames}), then drew tile`);
  } else {
    await addToLog(roomCode, `${SEAT_NAMES[seat]} drew a tile`);
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
 * - Advances turn to next player
 */
export async function discardTile(
  roomCode: string,
  seat: SeatIndex,
  tileId: TileId
): Promise<{ success: boolean }> {
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

  // Advance to next player
  const nextSeat = getNextSeat(seat);

  // Update game state
  await update(ref(db, `rooms/${roomCode}/game`), {
    discardPile,
    currentPlayerSeat: nextSeat,
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
  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: null, // null winner indicates draw
  });

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended',
  });
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
