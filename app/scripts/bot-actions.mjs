#!/usr/bin/env node
// Script to simulate bot player actions for testing

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, get } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDWqXdcIJH8oWTbEu2ZU9yZYlIxHxZjCPA",
  authDomain: "mahjong-vibe.firebaseapp.com",
  databaseURL: "https://mahjong-vibe-default-rtdb.firebaseio.com",
  projectId: "mahjong-vibe",
  storageBucket: "mahjong-vibe.firebasestorage.app",
  messagingSenderId: "1075117483024",
  appId: "1:1075117483024:web:2b033541c65b816a8bd695"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

console.log('Signing in...');
await signInAnonymously(auth);
console.log('Signed in!');

// Helper to check if a tile is a bonus tile
function isBonusTile(tileId) {
  return tileId.startsWith('wind_') || tileId.startsWith('dragon_');
}

// Process bonus exposure for a seat
async function exposeBonusForSeat(roomCode, seatIndex) {
  const seatKey = `seat${seatIndex}`;

  // Get current game state
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);
  if (!gameSnap.exists()) {
    console.log('Game not found');
    return;
  }
  const game = gameSnap.val();

  // Get private hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/${seatKey}`);
  const handSnap = await get(handRef);
  if (!handSnap.exists()) {
    console.log(`No hand for ${seatKey}`);
    return;
  }
  const hand = handSnap.val().concealedTiles || [];

  // Find bonus tiles
  const bonusTiles = hand.filter(isBonusTile);
  const regularTiles = hand.filter(t => !isBonusTile(t));

  console.log(`${seatKey}: ${bonusTiles.length} bonus tiles to expose`);

  if (bonusTiles.length === 0) {
    console.log(`${seatKey}: No bonus tiles, advancing...`);
  }

  // Draw replacement tiles from wall
  const wall = [...(game.wall || [])];
  const replacements = wall.splice(0, bonusTiles.length);
  const newHand = [...regularTiles, ...replacements];

  // Get existing bonus tiles for this seat
  const existingBonus = game.bonusTiles?.[seatKey] || [];

  // Update database
  const updates = {};
  updates[`rooms/${roomCode}/game/wall`] = wall;
  updates[`rooms/${roomCode}/game/bonusTiles/${seatKey}`] = [...existingBonus, ...bonusTiles];
  updates[`rooms/${roomCode}/privateHands/${seatKey}/concealedTiles`] = newHand;

  await update(ref(db), updates);
  console.log(`${seatKey}: Exposed ${bonusTiles.length} bonus tiles, drew ${replacements.length} replacements`);

  return bonusTiles.length;
}

// Advance bonus exposure phase
async function advanceBonusExposure(roomCode, currentSeat, dealerSeat) {
  const nextSeat = (currentSeat + 1) % 4;

  if (nextSeat === dealerSeat) {
    // All players have exposed, reveal Gold and start playing
    const gameRef = ref(db, `rooms/${roomCode}/game`);
    const gameSnap = await get(gameRef);
    const game = gameSnap.val();

    const wall = game.wall || [];
    const goldTile = wall.shift(); // Take one tile for Gold
    const goldType = goldTile.split('_').slice(0, 2).join('_');

    console.log(`Gold revealed: ${goldType} (${goldTile})`);

    await update(gameRef, {
      phase: 'playing',
      goldTileType: goldType,
      exposedGold: goldTile,
      wall: wall,
      currentPlayerSeat: dealerSeat,
      lastAction: { type: 'bonus_expose', playerSeat: currentSeat, timestamp: Date.now() }
    });

    console.log('Game phase: playing');
  } else {
    // Advance to next player
    await update(ref(db, `rooms/${roomCode}/game`), {
      currentPlayerSeat: nextSeat,
      lastAction: { type: 'bonus_expose', playerSeat: currentSeat, timestamp: Date.now() }
    });
    console.log(`Advanced to seat ${nextSeat}`);
  }
}

// Process all bot bonus exposures
async function processBotBonusExposures(roomCode) {
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);

  if (!gameSnap.exists()) {
    console.error('Game not found');
    return;
  }

  const game = gameSnap.val();
  console.log(`Current phase: ${game.phase}`);
  console.log(`Current player seat: ${game.currentPlayerSeat}`);
  console.log(`Dealer seat: ${game.dealerSeat}`);

  if (game.phase !== 'bonus_exposure') {
    console.log('Not in bonus exposure phase');
    return;
  }

  // Process seats 1, 2, 3 (the bots)
  for (let seat = 1; seat <= 3; seat++) {
    if (game.currentPlayerSeat === seat) {
      await exposeBonusForSeat(roomCode, seat);
      await advanceBonusExposure(roomCode, seat, game.dealerSeat);

      // Re-fetch game state
      const newSnap = await get(gameRef);
      const newGame = newSnap.val();
      if (newGame.phase !== 'bonus_exposure') {
        console.log('Bonus exposure complete!');
        break;
      }
    }
  }
}

// Discard a random tile for a bot
async function botDiscard(roomCode, seatIndex) {
  const seatKey = `seat${seatIndex}`;

  // Get hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/${seatKey}`);
  const handSnap = await get(handRef);
  const hand = handSnap.val()?.concealedTiles || [];

  if (hand.length !== 17) {
    console.log(`${seatKey} has ${hand.length} tiles, expected 17`);
    return;
  }

  // Get game state
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);
  const game = gameSnap.val();

  // Pick a random tile to discard (avoiding Gold if possible)
  const goldType = game.goldTileType;
  const nonGoldTiles = hand.filter(t => !t.startsWith(goldType));
  const tileToDiscard = nonGoldTiles.length > 0
    ? nonGoldTiles[Math.floor(Math.random() * nonGoldTiles.length)]
    : hand[Math.floor(Math.random() * hand.length)];

  // Remove from hand
  const newHand = hand.filter((t, i) => i !== hand.indexOf(tileToDiscard));

  // Add to discard pile
  const discardPile = [...(game.discardPile || []), tileToDiscard];

  // Enter calling phase
  const pendingCalls = {
    seat0: seatIndex === 0 ? 'discarder' : null,
    seat1: seatIndex === 1 ? 'discarder' : null,
    seat2: seatIndex === 2 ? 'discarder' : null,
    seat3: seatIndex === 3 ? 'discarder' : null,
  };

  const updates = {};
  updates[`rooms/${roomCode}/privateHands/${seatKey}/concealedTiles`] = newHand;
  updates[`rooms/${roomCode}/game/discardPile`] = discardPile;
  updates[`rooms/${roomCode}/game/phase`] = 'calling';
  updates[`rooms/${roomCode}/game/pendingCalls`] = pendingCalls;
  updates[`rooms/${roomCode}/game/lastAction`] = {
    type: 'discard',
    playerSeat: seatIndex,
    tile: tileToDiscard,
    timestamp: Date.now()
  };

  await update(ref(db), updates);
  console.log(`${seatKey} discarded: ${tileToDiscard}`);
}

// Bot passes on a call
async function botPass(roomCode, seatIndex) {
  const seatKey = `seat${seatIndex}`;

  await update(ref(db, `rooms/${roomCode}/game/pendingCalls`), {
    [seatKey]: 'pass'
  });
  console.log(`${seatKey} passed`);
}

// Main
const roomCode = process.argv[2];
const action = process.argv[3];

if (!roomCode) {
  console.log('Usage: node bot-actions.mjs <ROOM_CODE> [action]');
  console.log('Actions: bonus, discard <seat>, pass <seat>');
  process.exit(1);
}

if (action === 'bonus') {
  await processBotBonusExposures(roomCode);
} else if (action === 'discard') {
  const seat = parseInt(process.argv[4]);
  await botDiscard(roomCode, seat);
} else if (action === 'pass') {
  const seat = parseInt(process.argv[4]);
  await botPass(roomCode, seat);
} else {
  // Default: process bonus exposure
  await processBotBonusExposures(roomCode);
}

process.exit(0);
