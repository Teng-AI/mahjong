#!/usr/bin/env node

/**
 * Strategic Mahjong Bot
 *
 * An AI bot that plays Fujian Mahjong optimally.
 * Each bot instance only knows what that player can see (no cheating).
 *
 * Usage:
 *   node scripts/bot-player.mjs <roomCode> <seat> [--watch]
 *
 *   --watch: Continuously monitor and play (default: single action)
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, onValue, update } from 'firebase/database';

// Firebase config from environment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ============================================
// TILE UTILITIES
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

  // Count tiles by type
  const typeCounts = new Map();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  // Find complete sets (triplets)
  const triplets = [];
  for (const [type, count] of typeCounts) {
    if (count >= 3) {
      triplets.push(type);
    }
  }

  // Find pairs
  const pairs = [];
  for (const [type, count] of typeCounts) {
    if (count >= 2) {
      pairs.push(type);
    }
  }

  // Find partial sets (2 tiles that could become a set)
  const partials = [];
  for (const [type, count] of typeCounts) {
    if (count >= 2 && !triplets.includes(type)) {
      partials.push({ type, kind: 'pair-partial' });
    }

    // Check for sequence partials (suit tiles only)
    const parsed = parseTileType(type);
    if (parsed.category === 'suit') {
      const suit = parsed.suit;
      const val = parsed.value;

      // Adjacent tiles
      if (val <= 8) {
        const next = `${suit}_${val + 1}`;
        if (typeCounts.has(next)) {
          partials.push({ type, kind: 'sequence', tiles: [type, next] });
        }
      }

      // Gap tiles (e.g., 3 and 5)
      if (val <= 7) {
        const skip = `${suit}_${val + 2}`;
        if (typeCounts.has(skip)) {
          partials.push({ type, kind: 'gap', tiles: [type, skip], needs: `${suit}_${val + 1}` });
        }
      }
    }
  }

  // Find isolated tiles (not part of any combination)
  const isolated = [];
  for (const [type, count] of typeCounts) {
    const parsed = parseTileType(type);
    let hasConnection = false;

    if (count >= 2) hasConnection = true; // pair
    if (triplets.includes(type)) hasConnection = true;

    if (parsed.category === 'suit') {
      const suit = parsed.suit;
      const val = parsed.value;

      // Check adjacent tiles
      if (val > 1 && typeCounts.has(`${suit}_${val - 1}`)) hasConnection = true;
      if (val < 9 && typeCounts.has(`${suit}_${val + 1}`)) hasConnection = true;
      if (val > 2 && typeCounts.has(`${suit}_${val - 2}`)) hasConnection = true;
      if (val < 8 && typeCounts.has(`${suit}_${val + 2}`)) hasConnection = true;
    }

    if (!hasConnection) {
      isolated.push(type);
    }
  }

  // Count discarded tiles for safety analysis
  const discardCounts = new Map();
  for (const tile of discardPile) {
    const type = getTileType(tile);
    discardCounts.set(type, (discardCounts.get(type) || 0) + 1);
  }

  return {
    tiles,
    goldTiles,
    regularTiles,
    typeCounts,
    triplets,
    pairs,
    partials,
    isolated,
    discardCounts,
    goldCount: goldTiles.length
  };
}

function calculateShanten(hand, goldType, meldCount = 0) {
  const analysis = analyzeHand(hand, goldType);
  const setsNeeded = 5 - meldCount;

  // Simplified shanten calculation
  // A more accurate version would use recursive search
  let completeSets = analysis.triplets.length;
  let usefulPartials = Math.min(
    analysis.partials.length,
    setsNeeded - completeSets
  );
  let hasPair = analysis.pairs.length > 0;
  let availableGolds = analysis.goldCount;

  // Each gold can substitute for one missing tile
  let shanten = (setsNeeded - completeSets) * 3 + (hasPair ? 0 : 2);
  shanten -= usefulPartials * 2; // partials need 1 tile
  shanten -= availableGolds;

  return Math.max(0, Math.ceil(shanten / 2));
}

// ============================================
// STRATEGIC DECISIONS
// ============================================

function selectBestDiscard(hand, goldType, discardPile, meldCount = 0) {
  const analysis = analyzeHand(hand, goldType, discardPile);

  // Never discard gold tiles
  const candidates = analysis.regularTiles;

  if (candidates.length === 0) {
    console.log('Warning: No non-gold tiles to discard');
    return null;
  }

  // Score each tile (lower score = better to discard)
  const scores = [];

  for (const tile of candidates) {
    const type = getTileType(tile);
    let score = 50; // base score

    // Part of triplet: very valuable
    if (analysis.triplets.includes(type)) {
      score += 100;
    }

    // Part of pair (keep at least one pair for winning)
    const count = analysis.typeCounts.get(type) || 0;
    if (count >= 2) {
      if (analysis.pairs.length <= 1) {
        score += 60; // only pair, very valuable
      } else {
        score += 30; // multiple pairs, less critical
      }
    }

    // Part of sequence partial
    const inPartial = analysis.partials.some(p =>
      p.tiles && p.tiles.includes(type)
    );
    if (inPartial) {
      score += 40;
    }

    // Isolated tiles are good discard candidates
    if (analysis.isolated.includes(type)) {
      score -= 30;
    }

    // Honor tiles with no pair potential: discard early
    if (isHonorTile(tile) && count === 1) {
      score -= 20;
    }

    // Terminal tiles: slightly less valuable
    if (isTerminal(tile) && count === 1) {
      score -= 10;
    }

    // Safety: tiles discarded 3+ times are completely safe
    const discardCount = analysis.discardCounts.get(type) || 0;
    if (discardCount >= 3) {
      score -= 25; // bonus for safety
    } else if (discardCount >= 2) {
      score -= 15;
    }

    // Middle tiles (4,5,6) are dangerous to others
    const parsed = parseTileType(type);
    if (parsed.category === 'suit' && parsed.value >= 4 && parsed.value <= 6) {
      if (analysis.isolated.includes(type)) {
        score += 10; // slightly penalize discarding dangerous tiles
      }
    }

    scores.push({ tile, type, score });
  }

  // Sort by score ascending (lowest = best to discard)
  scores.sort((a, b) => a.score - b.score);

  console.log('Discard analysis (top 3):');
  scores.slice(0, 3).forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.type} (score: ${s.score})`);
  });

  return scores[0].tile;
}

function shouldCallPung(hand, discardTile, goldType, meldCount) {
  const type = getTileType(discardTile);
  const matchingTiles = hand.filter(t => getTileType(t) === type && !isGoldTile(t, goldType));

  if (matchingTiles.length < 2) {
    return false;
  }

  // Calculate shanten before and after
  const shantenBefore = calculateShanten(hand, goldType, meldCount);

  // Simulate hand after pung
  const handAfterPung = hand.filter(t => {
    const tType = getTileType(t);
    if (tType === type && !isGoldTile(t, goldType)) {
      if (matchingTiles.includes(t)) {
        matchingTiles.splice(matchingTiles.indexOf(t), 1);
        return matchingTiles.length >= 0 && matchingTiles.length < 2 ? false : true;
      }
    }
    return true;
  });

  // Remove 2 tiles for the pung
  let removed = 0;
  const newHand = hand.filter(t => {
    if (removed < 2 && getTileType(t) === type && !isGoldTile(t, goldType)) {
      removed++;
      return false;
    }
    return true;
  });

  const shantenAfter = calculateShanten(newHand, goldType, meldCount + 1);

  console.log(`Pung analysis for ${type}:`);
  console.log(`  Shanten before: ${shantenBefore}, after: ${shantenAfter}`);

  // Call if it improves hand significantly or we're close to winning
  if (shantenAfter < shantenBefore) {
    return true;
  }
  if (shantenAfter <= 1 && shantenBefore <= 2) {
    return true; // Close to tenpai, worth calling
  }

  return false;
}

function shouldCallChow(hand, discardTile, goldType, meldCount) {
  if (!isSuitTile(discardTile)) {
    return null; // Can't chow honors
  }

  if (isGoldTile(discardTile, goldType)) {
    return null; // Can't call gold
  }

  const parsed = parseTileType(getTileType(discardTile));
  const suit = parsed.suit;
  const val = parsed.value;

  // Find all possible chow combinations
  const options = [];

  // Discard is LOW (need val+1, val+2)
  if (val <= 7) {
    const need1 = `${suit}_${val + 1}`;
    const need2 = `${suit}_${val + 2}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) {
      options.push([has1, has2]);
    }
  }

  // Discard is MIDDLE (need val-1, val+1)
  if (val >= 2 && val <= 8) {
    const need1 = `${suit}_${val - 1}`;
    const need2 = `${suit}_${val + 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) {
      options.push([has1, has2]);
    }
  }

  // Discard is HIGH (need val-2, val-1)
  if (val >= 3) {
    const need1 = `${suit}_${val - 2}`;
    const need2 = `${suit}_${val - 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) {
      options.push([has1, has2]);
    }
  }

  if (options.length === 0) {
    return null;
  }

  const shantenBefore = calculateShanten(hand, goldType, meldCount);

  // Evaluate each option
  for (const [tile1, tile2] of options) {
    const newHand = hand.filter(t => t !== tile1 && t !== tile2);
    const shantenAfter = calculateShanten(newHand, goldType, meldCount + 1);

    console.log(`Chow option [${getTileType(tile1)}, ${getTileType(tile2)}]:`);
    console.log(`  Shanten before: ${shantenBefore}, after: ${shantenAfter}`);

    if (shantenAfter <= 1) {
      return [tile1, tile2]; // Good chow, gets us close to winning
    }
  }

  // Only chow if significantly improves hand
  const bestOption = options[0];
  const newHand = hand.filter(t => t !== bestOption[0] && t !== bestOption[1]);
  const shantenAfter = calculateShanten(newHand, goldType, meldCount + 1);

  if (shantenAfter < shantenBefore - 1) {
    return bestOption;
  }

  return null; // Pass - chow doesn't help enough
}

// ============================================
// WIN DETECTION (simplified)
// ============================================

function canFormWinningHand(tiles, goldType, meldCount = 0) {
  const setsNeeded = 5 - meldCount;
  const minTiles = 2 + (3 * setsNeeded);

  if (tiles.length < minTiles) {
    return false;
  }

  const goldTiles = tiles.filter(t => isGoldTile(t, goldType));
  const regularTiles = tiles.filter(t => !isGoldTile(t, goldType));

  const typeCounts = new Map();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  return tryFormSetsAndPair(typeCounts, goldTiles.length, false, setsNeeded);
}

function tryFormSetsAndPair(typeCounts, wildcards, hasPair, setsNeeded) {
  let totalTiles = wildcards;
  for (const count of typeCounts.values()) {
    totalTiles += count;
  }

  if (totalTiles === 0 && setsNeeded === 0) {
    return hasPair;
  }

  if (totalTiles === 2 && !hasPair && setsNeeded === 0) {
    // Check if can form pair
    for (const count of typeCounts.values()) {
      if (count >= 2) return true;
    }
    if (wildcards >= 1) {
      for (const count of typeCounts.values()) {
        if (count >= 1) return true;
      }
    }
    if (wildcards >= 2) return true;
    return false;
  }

  // Find first tile type with count > 0
  let firstType = null;
  for (const [type, count] of typeCounts) {
    if (count > 0) {
      firstType = type;
      break;
    }
  }

  if (!firstType) {
    if (wildcards >= 3 && setsNeeded > 0) {
      return tryFormSetsAndPair(new Map(typeCounts), wildcards - 3, hasPair, setsNeeded - 1);
    }
    if (wildcards === 2 && !hasPair && setsNeeded === 0) {
      return true;
    }
    return false;
  }

  const count = typeCounts.get(firstType);
  const parsed = parseTileType(firstType);

  // Try pair
  if (!hasPair && count >= 2) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 2);
    if (tryFormSetsAndPair(newCounts, wildcards, true, setsNeeded)) {
      return true;
    }
  }

  // Try pair with wildcard
  if (!hasPair && count >= 1 && wildcards >= 1) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 1);
    if (tryFormSetsAndPair(newCounts, wildcards - 1, true, setsNeeded)) {
      return true;
    }
  }

  // Try triplet
  if (count >= 3 && setsNeeded > 0) {
    const newCounts = new Map(typeCounts);
    newCounts.set(firstType, count - 3);
    if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) {
      return true;
    }
  }

  // Try sequence (suit tiles only)
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
      if (tryFormSetsAndPair(newCounts, wildcards, hasPair, setsNeeded - 1)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================
// BOT ACTIONS
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

async function botTakeTurn(roomCode, seat) {
  const gameState = await getGameState(roomCode);
  const hand = await getPrivateHand(roomCode, seat);

  if (!gameState || gameState.phase !== 'playing') {
    console.log('Not in playing phase');
    return null;
  }

  if (gameState.currentPlayerSeat !== seat) {
    console.log(`Not my turn (current: ${gameState.currentPlayerSeat}, me: ${seat})`);
    return null;
  }

  const goldType = gameState.goldTileType;
  const melds = gameState.exposedMelds?.[`seat${seat}`] || [];

  console.log(`\n=== Bot ${seat} Turn ===`);
  console.log(`Hand: ${hand.map(t => getTileType(t)).join(', ')}`);
  console.log(`Gold type: ${goldType}`);
  console.log(`Melds: ${melds.length}`);

  // Check if we need to draw
  const needsDraw = !gameState.lastAction ||
    gameState.lastAction.type === 'discard' ||
    (gameState.lastAction.type === 'draw' && gameState.lastAction.playerSeat !== seat);

  if (needsDraw) {
    console.log('Action: Need to draw');
    return { action: 'draw' };
  }

  // Check for win
  if (canFormWinningHand(hand, goldType, melds.length)) {
    console.log('Action: WINNING HAND DETECTED!');
    return { action: 'win' };
  }

  // Select discard
  const discardPile = gameState.discardPile || [];
  const bestDiscard = selectBestDiscard(hand, goldType, discardPile, melds.length);

  if (bestDiscard) {
    console.log(`Action: Discard ${getTileType(bestDiscard)}`);
    return { action: 'discard', tile: bestDiscard };
  }

  return null;
}

async function botRespondToCall(roomCode, seat) {
  const gameState = await getGameState(roomCode);
  const hand = await getPrivateHand(roomCode, seat);

  if (!gameState || gameState.phase !== 'calling') {
    return null;
  }

  // Check if already responded
  const myCall = gameState.pendingCalls?.[`seat${seat}`];
  if (myCall && myCall !== 'discarder') {
    console.log(`Already responded with: ${myCall}`);
    return null;
  }

  // Can't call own discard
  if (gameState.lastAction?.playerSeat === seat) {
    return null;
  }

  const discardTile = gameState.lastAction?.tile;
  if (!discardTile) {
    return null;
  }

  const goldType = gameState.goldTileType;
  const melds = gameState.exposedMelds?.[`seat${seat}`] || [];

  console.log(`\n=== Bot ${seat} Call Response ===`);
  console.log(`Hand: ${hand.map(t => getTileType(t)).join(', ')}`);
  console.log(`Discard: ${getTileType(discardTile)}`);

  // Check for win
  const testHand = [...hand, discardTile];
  if (canFormWinningHand(testHand, goldType, melds.length)) {
    console.log('Action: WIN on discard!');
    return { action: 'win' };
  }

  // Check for pung
  if (shouldCallPung(hand, discardTile, goldType, melds.length)) {
    console.log('Action: PUNG');
    return { action: 'pung' };
  }

  // Check for chow (only if next in turn)
  const discarderSeat = gameState.lastAction.playerSeat;
  const isNextInTurn = seat === (discarderSeat + 1) % 4;

  if (isNextInTurn) {
    const chowTiles = shouldCallChow(hand, discardTile, goldType, melds.length);
    if (chowTiles) {
      console.log(`Action: CHOW with [${getTileType(chowTiles[0])}, ${getTileType(chowTiles[1])}]`);
      return { action: 'chow', tiles: chowTiles };
    }
  }

  console.log('Action: PASS');
  return { action: 'pass' };
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node bot-player.mjs <roomCode> <seat> [--watch]');
    console.log('  seat: 0-3');
    console.log('  --watch: continuously monitor and play');
    process.exit(1);
  }

  const roomCode = args[0].toUpperCase();
  const seat = parseInt(args[1]);
  const watchMode = args.includes('--watch');

  if (seat < 0 || seat > 3) {
    console.log('Seat must be 0-3');
    process.exit(1);
  }

  console.log(`Starting bot for room ${roomCode}, seat ${seat}`);

  if (watchMode) {
    console.log('Watch mode enabled - will continuously play');

    // Subscribe to game state changes
    const gameRef = ref(db, `rooms/${roomCode}/game`);

    onValue(gameRef, async (snapshot) => {
      const gameState = snapshot.val();
      if (!gameState) return;

      // Small delay to let state settle
      await new Promise(r => setTimeout(r, 500));

      if (gameState.phase === 'playing' && gameState.currentPlayerSeat === seat) {
        const result = await botTakeTurn(roomCode, seat);
        if (result) {
          console.log(`Would execute: ${JSON.stringify(result)}`);
          // TODO: Actually execute the action
        }
      } else if (gameState.phase === 'calling') {
        const myCall = gameState.pendingCalls?.[`seat${seat}`];
        if (!myCall || myCall === null) {
          const result = await botRespondToCall(roomCode, seat);
          if (result) {
            console.log(`Would respond: ${JSON.stringify(result)}`);
            // TODO: Actually execute the call response
          }
        }
      }
    });

    // Keep process running
    console.log('Watching for game state changes... (Ctrl+C to stop)');
    await new Promise(() => {}); // Run forever

  } else {
    // Single action mode
    const gameState = await getGameState(roomCode);

    if (!gameState) {
      console.log('No game state found');
      process.exit(1);
    }

    if (gameState.phase === 'playing') {
      const result = await botTakeTurn(roomCode, seat);
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (gameState.phase === 'calling') {
      const result = await botRespondToCall(roomCode, seat);
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log(`Game phase: ${gameState.phase} - no action needed`);
    }

    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
