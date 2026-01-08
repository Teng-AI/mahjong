#!/usr/bin/env node

/**
 * Full Bot Game Runner
 *
 * Runs a complete game with AI bots playing all 4 seats.
 * Useful for testing game mechanics and finding edge cases.
 *
 * Usage:
 *   node scripts/bot-game.mjs <roomCode> [--speed=fast|normal|slow]
 *
 * Prerequisites:
 *   - Room must exist with game started
 *   - Use setup-test-game.mjs first to create a room
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update, runTransaction } from 'firebase/database';

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Speed settings (ms between actions)
const SPEEDS = {
  fast: 100,
  normal: 500,
  slow: 1500
};

// ============================================
// TILE UTILITIES (copied from bot-player.mjs)
// ============================================

function getTileType(tileId) {
  const parts = tileId.split('_');
  return `${parts[0]}_${parts[1]}`;
}

function parseTileType(tileType) {
  const parts = tileType.split('_');
  if (parts[0] === 'wind' || parts[0] === 'dragon') {
    return { category: parts[0], value: parts[1] };
  }
  return { category: 'suit', suit: parts[0], value: parseInt(parts[1]) };
}

function isGoldTile(tileId, goldType) {
  return getTileType(tileId) === goldType;
}

function isHonorTile(tileId) {
  const type = getTileType(tileId);
  return type.startsWith('wind_') || type.startsWith('dragon_');
}

function isTerminal(tileId) {
  const parsed = parseTileType(getTileType(tileId));
  return parsed.category === 'suit' && (parsed.value === 1 || parsed.value === 9);
}

function isSuitTile(tileId) {
  const type = getTileType(tileId);
  return type.startsWith('dots_') || type.startsWith('bamboo_') || type.startsWith('characters_');
}

// ============================================
// HAND ANALYSIS
// ============================================

function analyzeHand(hand, goldType, discardPile = []) {
  const tiles = [...hand];
  const goldTiles = tiles.filter(t => isGoldTile(t, goldType));
  const regularTiles = tiles.filter(t => !isGoldTile(t, goldType));

  const typeCounts = new Map();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  const triplets = [];
  for (const [type, count] of typeCounts) {
    if (count >= 3) triplets.push(type);
  }

  const pairs = [];
  for (const [type, count] of typeCounts) {
    if (count >= 2) pairs.push(type);
  }

  const isolated = [];
  for (const [type, count] of typeCounts) {
    const parsed = parseTileType(type);
    let hasConnection = count >= 2 || triplets.includes(type);

    if (parsed.category === 'suit') {
      const suit = parsed.suit;
      const val = parsed.value;
      if (val > 1 && typeCounts.has(`${suit}_${val - 1}`)) hasConnection = true;
      if (val < 9 && typeCounts.has(`${suit}_${val + 1}`)) hasConnection = true;
      if (val > 2 && typeCounts.has(`${suit}_${val - 2}`)) hasConnection = true;
      if (val < 8 && typeCounts.has(`${suit}_${val + 2}`)) hasConnection = true;
    }

    if (!hasConnection) isolated.push(type);
  }

  const discardCounts = new Map();
  for (const tile of discardPile) {
    const type = getTileType(tile);
    discardCounts.set(type, (discardCounts.get(type) || 0) + 1);
  }

  return { tiles, goldTiles, regularTiles, typeCounts, triplets, pairs, isolated, discardCounts, goldCount: goldTiles.length };
}

function selectBestDiscard(hand, goldType, discardPile, meldCount = 0) {
  const analysis = analyzeHand(hand, goldType, discardPile);
  const candidates = analysis.regularTiles;

  if (candidates.length === 0) return null;

  const scores = [];
  for (const tile of candidates) {
    const type = getTileType(tile);
    let score = 50;

    if (analysis.triplets.includes(type)) score += 100;
    const count = analysis.typeCounts.get(type) || 0;
    if (count >= 2) score += analysis.pairs.length <= 1 ? 60 : 30;
    if (analysis.isolated.includes(type)) score -= 30;
    if (isHonorTile(tile) && count === 1) score -= 20;
    if (isTerminal(tile) && count === 1) score -= 10;

    const discardCount = analysis.discardCounts.get(type) || 0;
    if (discardCount >= 3) score -= 25;
    else if (discardCount >= 2) score -= 15;

    scores.push({ tile, type, score });
  }

  scores.sort((a, b) => a.score - b.score);
  return scores[0].tile;
}

function shouldCallPung(hand, discardTile, goldType, meldCount) {
  const type = getTileType(discardTile);
  const matchCount = hand.filter(t => getTileType(t) === type && !isGoldTile(t, goldType)).length;
  if (matchCount < 2) return false;

  // Simple heuristic: call pung if it doesn't leave us with too many isolated tiles
  const analysis = analyzeHand(hand, goldType);
  return analysis.isolated.length <= 3 || meldCount >= 2;
}

function shouldCallChow(hand, discardTile, goldType, meldCount) {
  if (!isSuitTile(discardTile) || isGoldTile(discardTile, goldType)) return null;

  const parsed = parseTileType(getTileType(discardTile));
  const suit = parsed.suit;
  const val = parsed.value;

  const options = [];

  if (val <= 7) {
    const need1 = `${suit}_${val + 1}`;
    const need2 = `${suit}_${val + 2}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  if (val >= 2 && val <= 8) {
    const need1 = `${suit}_${val - 1}`;
    const need2 = `${suit}_${val + 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  if (val >= 3) {
    const need1 = `${suit}_${val - 2}`;
    const need2 = `${suit}_${val - 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  if (options.length === 0) return null;

  // Simple heuristic: chow if we have few melds
  if (meldCount <= 2) return options[0];
  return null;
}

// ============================================
// WIN DETECTION
// ============================================

function canFormWinningHand(tiles, goldType, meldCount = 0) {
  const setsNeeded = 5 - meldCount;
  const minTiles = 2 + (3 * setsNeeded);
  if (tiles.length < minTiles) return false;

  const goldTiles = tiles.filter(t => isGoldTile(t, goldType));
  const regularTiles = tiles.filter(t => !isGoldTile(t, goldType));

  const typeCounts = new Map();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  // Sort types for consistent processing
  const sortedTypes = Array.from(typeCounts.keys()).sort((a, b) => {
    const pa = parseTileType(a);
    const pb = parseTileType(b);
    if (pa.category !== pb.category) {
      return pa.category === 'suit' ? 1 : -1;
    }
    if (pa.category === 'suit' && pb.category === 'suit') {
      if (pa.suit !== pb.suit) return pa.suit.localeCompare(pb.suit);
      return pa.value - pb.value;
    }
    return 0;
  });

  const sortedCounts = new Map();
  for (const type of sortedTypes) {
    sortedCounts.set(type, typeCounts.get(type));
  }

  return tryFormSetsAndPair(sortedCounts, goldTiles.length, false, setsNeeded);
}

function tryFormSetsAndPair(typeCounts, wildcards, hasPair, setsNeeded) {
  let totalTiles = wildcards;
  for (const count of typeCounts.values()) totalTiles += count;

  if (totalTiles === 0 && setsNeeded === 0) return hasPair;

  if (totalTiles === 2 && !hasPair && setsNeeded === 0) {
    for (const count of typeCounts.values()) if (count >= 2) return true;
    if (wildcards >= 1) for (const count of typeCounts.values()) if (count >= 1) return true;
    if (wildcards >= 2) return true;
    return false;
  }

  let firstType = null;
  for (const [type, count] of typeCounts) {
    if (count > 0) { firstType = type; break; }
  }

  if (!firstType) {
    if (wildcards >= 3 && setsNeeded > 0) {
      return tryFormSetsAndPair(new Map(typeCounts), wildcards - 3, hasPair, setsNeeded - 1);
    }
    if (wildcards === 2 && !hasPair && setsNeeded === 0) return true;
    return false;
  }

  const count = typeCounts.get(firstType);
  const parsed = parseTileType(firstType);

  // Try pair
  if (!hasPair && count >= 2) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 2);
    if (tryFormSetsAndPair(newCounts, wildcards, true, setsNeeded)) return true;
  }

  if (!hasPair && count >= 1 && wildcards >= 1) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 1);
    if (tryFormSetsAndPair(newCounts, wildcards - 1, true, setsNeeded)) return true;
  }

  // Try triplet
  if (count >= 3 && setsNeeded > 0) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 3);
    if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) return true;
  }

  // Try sequence
  if (parsed.category === 'suit' && parsed.value <= 7 && setsNeeded > 0) {
    const type2 = `${parsed.suit}_${parsed.value + 1}`;
    const type3 = `${parsed.suit}_${parsed.value + 2}`;
    const count2 = typeCounts.get(type2) || 0;
    const count3 = typeCounts.get(type3) || 0;

    if (count >= 1 && count2 >= 1 && count3 >= 1) {
      const newCounts = new Map(typeCounts);
      newCounts.set(firstType, count - 1);
      newCounts.set(type2, count2 - 1);
      newCounts.set(type3, count3 - 1);
      if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) return true;
    }
  }

  return false;
}

// ============================================
// GAME ACTIONS
// ============================================

async function getGameState(roomCode) {
  const snapshot = await get(ref(db, `rooms/${roomCode}/game`));
  return snapshot.val();
}

async function getPrivateHand(roomCode, seat) {
  const snapshot = await get(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`));
  const data = snapshot.val();
  return data?.concealedTiles || [];
}

async function drawTile(roomCode, seat) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);

  const result = await runTransaction(gameRef, (game) => {
    if (!game || game.phase !== 'playing' || game.currentPlayerSeat !== seat) {
      return;
    }

    if (game.wall.length === 0) {
      game.phase = 'ended';
      game.winner = null;
      return game;
    }

    const drawnTile = game.wall.pop();

    game.lastAction = {
      type: 'draw',
      playerSeat: seat,
      tile: drawnTile,
      timestamp: Date.now()
    };

    return game;
  });

  if (result.committed) {
    const game = result.snapshot.val();
    const drawnTile = game.lastAction?.tile;

    if (drawnTile) {
      // Add to private hand
      const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${seat}/concealedTiles`);
      const handSnap = await get(handRef);
      const hand = handSnap.val() || [];
      hand.push(drawnTile);
      await update(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), { concealedTiles: hand });
    }

    return { success: true, tile: drawnTile };
  }

  return { success: false };
}

async function discardTile(roomCode, seat, tileId) {
  // Remove from hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${seat}/concealedTiles`);
  const handSnap = await get(handRef);
  let hand = handSnap.val() || [];

  const idx = hand.indexOf(tileId);
  if (idx === -1) return { success: false, error: 'Tile not in hand' };

  hand.splice(idx, 1);
  await update(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), { concealedTiles: hand });

  // Update game state
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  await runTransaction(gameRef, (game) => {
    if (!game) return;

    game.discardPile = game.discardPile || [];
    game.discardPile.push(tileId);

    game.lastAction = {
      type: 'discard',
      playerSeat: seat,
      tile: tileId,
      timestamp: Date.now()
    };

    // Enter calling phase
    game.phase = 'calling';
    game.pendingCalls = {
      seat0: seat === 0 ? 'discarder' : null,
      seat1: seat === 1 ? 'discarder' : null,
      seat2: seat === 2 ? 'discarder' : null,
      seat3: seat === 3 ? 'discarder' : null,
    };

    return game;
  });

  return { success: true };
}

async function submitCallResponse(roomCode, seat, action, chowTiles = null) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);

  await update(ref(db, `rooms/${roomCode}/game/pendingCalls`), {
    [`seat${seat}`]: action === 'chow' ? { action, tiles: chowTiles } : action
  });

  // Check if all responded
  const gameSnap = await get(gameRef);
  const game = gameSnap.val();

  const calls = game.pendingCalls;
  const allResponded = [0, 1, 2, 3].every(s => {
    const call = calls[`seat${s}`];
    return call === 'discarder' || call !== null;
  });

  if (allResponded) {
    await resolveCallingPhase(roomCode);
  }

  return { success: true };
}

async function resolveCallingPhase(roomCode) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);
  const game = gameSnap.val();

  if (game.phase !== 'calling') return;

  const calls = game.pendingCalls;
  const discardTile = game.lastAction.tile;
  const discarderSeat = game.lastAction.playerSeat;

  // Priority: win > pung > chow > pass
  let winner = null;
  let punger = null;
  let chower = null;

  for (let s = 0; s < 4; s++) {
    const call = calls[`seat${s}`];
    if (call === 'win') winner = s;
    else if (call === 'pung') punger = s;
    else if (call?.action === 'chow') chower = { seat: s, tiles: call.tiles };
  }

  if (winner !== null) {
    // Handle win
    await declareWin(roomCode, winner, discardTile, discarderSeat);
  } else if (punger !== null) {
    // Handle pung
    await executePung(roomCode, punger, discardTile);
  } else if (chower !== null) {
    // Handle chow
    await executeChow(roomCode, chower.seat, discardTile, chower.tiles);
  } else {
    // All passed - next player's turn
    const nextSeat = (discarderSeat + 1) % 4;
    await update(gameRef, {
      phase: 'playing',
      currentPlayerSeat: nextSeat,
      pendingCalls: null
    });
  }
}

async function declareWin(roomCode, winnerSeat, winningTile, discarderSeat) {
  const hand = await getPrivateHand(roomCode, winnerSeat);
  const gameSnap = await get(ref(db, `rooms/${roomCode}/game`));
  const game = gameSnap.val();

  // Simple scoring
  const score = {
    base: 1,
    bonusTiles: 0,
    golds: hand.filter(t => isGoldTile(t, game.goldTileType)).length,
    subtotal: 0,
    multiplier: 1,
    total: 0
  };
  score.subtotal = score.base + score.bonusTiles + score.golds;
  score.total = score.subtotal;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat: winnerSeat,
      hand: [...hand, winningTile],
      winningTile,
      discarderSeat,
      isSelfDraw: false,
      score
    },
    pendingCalls: null
  });
}

async function executePung(roomCode, seat, discardTile) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${seat}/concealedTiles`);

  // Get hand and remove 2 matching tiles
  const handSnap = await get(handRef);
  let hand = handSnap.val() || [];
  const type = getTileType(discardTile);

  const matching = hand.filter(t => getTileType(t) === type);
  const tilesToRemove = matching.slice(0, 2);

  hand = hand.filter(t => !tilesToRemove.includes(t));
  await update(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), { concealedTiles: hand });

  // Remove from discard pile and add meld
  const gameSnap = await get(gameRef);
  const game = gameSnap.val();

  const discardPile = game.discardPile || [];
  discardPile.pop(); // Remove the called tile

  const melds = game.exposedMelds?.[`seat${seat}`] || [];
  melds.push({
    type: 'pung',
    tiles: [...tilesToRemove, discardTile]
  });

  await update(gameRef, {
    discardPile,
    [`exposedMelds/seat${seat}`]: melds,
    phase: 'playing',
    currentPlayerSeat: seat,
    lastAction: {
      type: 'pung',
      playerSeat: seat,
      tile: discardTile,
      timestamp: Date.now()
    },
    pendingCalls: null
  });
}

async function executeChow(roomCode, seat, discardTile, chowTiles) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${seat}/concealedTiles`);

  // Get hand and remove chow tiles
  const handSnap = await get(handRef);
  let hand = handSnap.val() || [];

  hand = hand.filter(t => !chowTiles.includes(t));
  await update(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), { concealedTiles: hand });

  // Remove from discard pile and add meld
  const gameSnap = await get(gameRef);
  const game = gameSnap.val();

  const discardPile = game.discardPile || [];
  discardPile.pop();

  const melds = game.exposedMelds?.[`seat${seat}`] || [];
  melds.push({
    type: 'chow',
    tiles: [...chowTiles, discardTile]
  });

  await update(gameRef, {
    discardPile,
    [`exposedMelds/seat${seat}`]: melds,
    phase: 'playing',
    currentPlayerSeat: seat,
    lastAction: {
      type: 'chow',
      playerSeat: seat,
      tile: discardTile,
      timestamp: Date.now()
    },
    pendingCalls: null
  });
}

async function declareSelfDrawWin(roomCode, seat) {
  const hand = await getPrivateHand(roomCode, seat);
  const gameSnap = await get(ref(db, `rooms/${roomCode}/game`));
  const game = gameSnap.val();

  const winningTile = game.lastAction?.tile;

  const score = {
    base: 1,
    bonusTiles: 0,
    golds: hand.filter(t => isGoldTile(t, game.goldTileType)).length,
    subtotal: 0,
    multiplier: 2, // Self-draw bonus
    total: 0
  };
  score.subtotal = score.base + score.bonusTiles + score.golds;
  score.total = score.subtotal * score.multiplier;

  await update(ref(db, `rooms/${roomCode}/game`), {
    phase: 'ended',
    winner: {
      seat,
      hand,
      winningTile,
      isSelfDraw: true,
      score
    }
  });
}

// ============================================
// BOT LOGIC
// ============================================

async function botTakeTurn(roomCode, seat, game) {
  const hand = await getPrivateHand(roomCode, seat);
  const goldType = game.goldTileType;
  const melds = game.exposedMelds?.[`seat${seat}`] || [];

  // Check if need to draw
  const lastAction = game.lastAction;
  const needsDraw = !lastAction ||
    lastAction.type === 'discard' ||
    (lastAction.type !== 'draw') ||
    (lastAction.type === 'draw' && lastAction.playerSeat !== seat);

  if (needsDraw && (lastAction?.type !== 'chow' && lastAction?.type !== 'pung' || lastAction?.playerSeat !== seat)) {
    console.log(`  Bot ${seat}: Drawing...`);
    const result = await drawTile(roomCode, seat);
    if (!result.success) {
      console.log(`  Bot ${seat}: Draw failed`);
      return false;
    }
    console.log(`  Bot ${seat}: Drew ${getTileType(result.tile)}`);

    // Re-get hand after draw
    const newHand = await getPrivateHand(roomCode, seat);

    // Check for win after draw
    if (canFormWinningHand(newHand, goldType, melds.length)) {
      console.log(`  Bot ${seat}: WINNING! Self-draw!`);
      await declareSelfDrawWin(roomCode, seat);
      return true;
    }

    // Select and discard
    const discardPile = game.discardPile || [];
    const bestDiscard = selectBestDiscard(newHand, goldType, discardPile, melds.length);
    if (bestDiscard) {
      console.log(`  Bot ${seat}: Discarding ${getTileType(bestDiscard)}`);
      await discardTile(roomCode, seat, bestDiscard);
    }
    return true;
  }

  // Already drew (after call) - just discard
  // Check for win first
  if (canFormWinningHand(hand, goldType, melds.length)) {
    console.log(`  Bot ${seat}: WINNING! Self-draw!`);
    await declareSelfDrawWin(roomCode, seat);
    return true;
  }

  const discardPile = game.discardPile || [];
  const bestDiscard = selectBestDiscard(hand, goldType, discardPile, melds.length);
  if (bestDiscard) {
    console.log(`  Bot ${seat}: Discarding ${getTileType(bestDiscard)}`);
    await discardTile(roomCode, seat, bestDiscard);
  }
  return true;
}

async function botRespondToCall(roomCode, seat, game) {
  if (game.lastAction?.playerSeat === seat) {
    return; // Can't call own discard
  }

  const myCall = game.pendingCalls?.[`seat${seat}`];
  if (myCall && myCall !== null) {
    return; // Already responded
  }

  const hand = await getPrivateHand(roomCode, seat);
  const goldType = game.goldTileType;
  const melds = game.exposedMelds?.[`seat${seat}`] || [];
  const discardTile = game.lastAction?.tile;

  if (!discardTile) return;

  // Check for win
  const testHand = [...hand, discardTile];
  if (canFormWinningHand(testHand, goldType, melds.length)) {
    console.log(`  Bot ${seat}: Calling WIN!`);
    await submitCallResponse(roomCode, seat, 'win');
    return;
  }

  // Check for pung
  if (shouldCallPung(hand, discardTile, goldType, melds.length)) {
    console.log(`  Bot ${seat}: Calling PUNG on ${getTileType(discardTile)}`);
    await submitCallResponse(roomCode, seat, 'pung');
    return;
  }

  // Check for chow
  const discarderSeat = game.lastAction.playerSeat;
  const isNextInTurn = seat === (discarderSeat + 1) % 4;

  if (isNextInTurn) {
    const chowTiles = shouldCallChow(hand, discardTile, goldType, melds.length);
    if (chowTiles) {
      console.log(`  Bot ${seat}: Calling CHOW with [${chowTiles.map(t => getTileType(t)).join(', ')}]`);
      await submitCallResponse(roomCode, seat, 'chow', chowTiles);
      return;
    }
  }

  console.log(`  Bot ${seat}: PASS`);
  await submitCallResponse(roomCode, seat, 'pass');
}

// ============================================
// MAIN GAME LOOP
// ============================================

async function runBotGame(roomCode, delay) {
  console.log(`\n========================================`);
  console.log(`Starting bot game for room: ${roomCode}`);
  console.log(`Delay between actions: ${delay}ms`);
  console.log(`========================================\n`);

  let turnCount = 0;
  const maxTurns = 500; // Safety limit

  while (turnCount < maxTurns) {
    turnCount++;

    const game = await getGameState(roomCode);

    if (!game) {
      console.log('No game state found');
      break;
    }

    if (game.phase === 'ended') {
      console.log('\n========================================');
      console.log('GAME ENDED!');
      if (game.winner) {
        console.log(`Winner: Seat ${game.winner.seat}`);
        console.log(`Score: ${game.winner.score?.total || 0}`);
        console.log(`Self-draw: ${game.winner.isSelfDraw}`);
      } else {
        console.log('Draw - wall exhausted');
      }
      console.log(`Total turns: ${turnCount}`);
      console.log('========================================\n');
      break;
    }

    if (game.phase === 'bonus_exposure') {
      console.log('Bonus exposure phase - skipping (should be done manually)');
      break;
    }

    if (game.phase === 'playing') {
      const currentSeat = game.currentPlayerSeat;
      console.log(`\nTurn ${turnCount}: Seat ${currentSeat}'s turn`);
      await botTakeTurn(roomCode, currentSeat, game);
    }

    if (game.phase === 'calling') {
      console.log(`\nTurn ${turnCount}: Calling phase`);
      // All non-discarder bots respond
      for (let s = 0; s < 4; s++) {
        if (game.pendingCalls?.[`seat${s}`] !== 'discarder') {
          await botRespondToCall(roomCode, s, game);
        }
      }
    }

    await new Promise(r => setTimeout(r, delay));
  }

  if (turnCount >= maxTurns) {
    console.log('Max turns reached - stopping');
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node bot-game.mjs <roomCode> [--speed=fast|normal|slow]');
    console.log('\nSpeeds:');
    console.log('  fast:   100ms between actions');
    console.log('  normal: 500ms between actions (default)');
    console.log('  slow:   1500ms between actions');
    process.exit(1);
  }

  const roomCode = args[0].toUpperCase();

  let speed = 'normal';
  for (const arg of args) {
    if (arg.startsWith('--speed=')) {
      speed = arg.split('=')[1];
    }
  }

  const delay = SPEEDS[speed] || SPEEDS.normal;

  await runBotGame(roomCode, delay);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
