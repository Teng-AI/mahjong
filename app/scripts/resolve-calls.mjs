#!/usr/bin/env node
// Script to resolve calling phase when all players have responded

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, get } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

await signInAnonymously(auth);

const roomCode = process.argv[2] || 'H47T9U';

// Get game state
const gameRef = ref(db, `rooms/${roomCode}/game`);
const gameSnap = await get(gameRef);
const game = gameSnap.val();

console.log('Phase:', game.phase);
console.log('Pending calls:', game.pendingCalls);

if (game.phase !== 'calling') {
  console.log('Not in calling phase');
  process.exit(1);
}

const pendingCalls = game.pendingCalls;
const discardTile = game.lastAction?.tile;
const discarderSeat = game.lastAction?.playerSeat;

console.log('Discard tile:', discardTile);
console.log('Discarder seat:', discarderSeat);

// Check for any calls
const winCallers = [];
const pungCallers = [];
let chowCaller = null;

for (let seat = 0; seat < 4; seat++) {
  const call = pendingCalls[`seat${seat}`];
  console.log(`Seat ${seat}: ${call}`);
  if (call === 'win') winCallers.push(seat);
  else if (call === 'pung') pungCallers.push(seat);
  else if (call === 'chow') chowCaller = seat;
}

// Priority resolution: Win > Pung > Chow
if (winCallers.length > 0) {
  console.log('Win detected!');
  // Handle win - would need to implement
  process.exit(0);
}

if (pungCallers.length > 0) {
  const caller = pungCallers[0];
  console.log(`Executing PUNG for seat ${caller}`);

  // Get caller's hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${caller}`);
  const handSnap = await get(handRef);
  const hand = handSnap.val()?.concealedTiles || [];

  // Get the discard tile type (without the instance number)
  const discardType = discardTile.split('_').slice(0, 2).join('_');

  // Find 2 matching tiles in hand
  const matchingTiles = hand.filter(t => t.startsWith(discardType + '_'));
  if (matchingTiles.length < 2) {
    console.error('Not enough matching tiles for pung!');
    process.exit(1);
  }

  const tilesToRemove = matchingTiles.slice(0, 2);
  console.log('Removing tiles from hand:', tilesToRemove);

  // Remove tiles from hand
  const newHand = [...hand];
  for (const tile of tilesToRemove) {
    const idx = newHand.indexOf(tile);
    if (idx !== -1) newHand.splice(idx, 1);
  }

  // Create meld
  const meld = {
    type: 'pung',
    tiles: [tilesToRemove[0], tilesToRemove[1], discardTile],
    calledTile: discardTile,
    fromSeat: discarderSeat,
  };

  // Get existing melds
  const existingMelds = game.exposedMelds?.[`seat${caller}`] || [];

  // Remove discarded tile from discard pile
  const discardPile = [...(game.discardPile || [])];
  const discardIdx = discardPile.indexOf(discardTile);
  if (discardIdx !== -1) discardPile.splice(discardIdx, 1);

  // Update database
  const updates = {};
  updates[`rooms/${roomCode}/privateHands/seat${caller}/concealedTiles`] = newHand;
  updates[`rooms/${roomCode}/game/exposedMelds/seat${caller}`] = [...existingMelds, meld];
  updates[`rooms/${roomCode}/game/discardPile`] = discardPile;
  updates[`rooms/${roomCode}/game/phase`] = 'playing';
  updates[`rooms/${roomCode}/game/currentPlayerSeat`] = caller;
  updates[`rooms/${roomCode}/game/pendingCalls`] = null;
  updates[`rooms/${roomCode}/game/lastAction`] = {
    type: 'pung',
    playerSeat: caller,
    tile: discardTile,
    timestamp: Date.now(),
  };
  updates[`rooms/${roomCode}/game/actionLog`] = [
    ...(game.actionLog || []),
    `East called PUNG on 6竹`,
  ].slice(-20);

  await update(ref(db), updates);
  console.log('PUNG executed successfully!');
  console.log(`Seat ${caller} now has ${newHand.length} tiles and 1 exposed meld`);
  process.exit(0);
}

if (chowCaller !== null) {
  console.log(`Executing CHOW for seat ${chowCaller}`);

  // Get the pending chow option stored during submitCallResponse
  const chowOption = game.pendingChowOption;
  if (!chowOption) {
    console.error('No pendingChowOption found!');
    process.exit(1);
  }

  console.log('Chow option:', chowOption);

  // Get caller's hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${chowCaller}`);
  const handSnap = await get(handRef);
  const hand = handSnap.val()?.concealedTiles || [];

  // Remove specified tiles from hand
  const newHand = [...hand];
  for (const tileToRemove of chowOption.tilesFromHand) {
    const idx = newHand.indexOf(tileToRemove);
    if (idx !== -1) {
      newHand.splice(idx, 1);
    }
  }

  // Create meld (tiles sorted by value for display)
  const meldTiles = [...chowOption.tilesFromHand, discardTile].sort((a, b) => {
    const getVal = (t) => parseInt(t.split('_')[1]);
    return getVal(a) - getVal(b);
  });

  const meld = {
    type: 'chow',
    tiles: meldTiles,
    calledTile: discardTile,
    fromSeat: discarderSeat,
  };

  // Get existing melds
  const existingMelds = game.exposedMelds?.[`seat${chowCaller}`] || [];

  // Remove discarded tile from discard pile
  const discardPile = [...(game.discardPile || [])];
  const discardIdx = discardPile.indexOf(discardTile);
  if (discardIdx !== -1) discardPile.splice(discardIdx, 1);

  // Update database
  const updates = {};
  updates[`rooms/${roomCode}/privateHands/seat${chowCaller}/concealedTiles`] = newHand;
  updates[`rooms/${roomCode}/game/exposedMelds/seat${chowCaller}`] = [...existingMelds, meld];
  updates[`rooms/${roomCode}/game/discardPile`] = discardPile;
  updates[`rooms/${roomCode}/game/phase`] = 'playing';
  updates[`rooms/${roomCode}/game/currentPlayerSeat`] = chowCaller;
  updates[`rooms/${roomCode}/game/pendingCalls`] = null;
  updates[`rooms/${roomCode}/game/pendingChowOption`] = null;
  updates[`rooms/${roomCode}/game/lastAction`] = {
    type: 'chow',
    playerSeat: chowCaller,
    tile: discardTile,
    timestamp: Date.now(),
  };

  await update(ref(db), updates);
  console.log('CHOW executed successfully!');
  console.log(`Seat ${chowCaller} now has ${newHand.length} tiles and ${existingMelds.length + 1} exposed melds`);
  process.exit(0);
}

// All pass - advance to next player
const nextSeat = (discarderSeat + 1) % 4;
console.log(`All passed. Advancing to seat ${nextSeat}`);

await update(gameRef, {
  phase: 'playing',
  currentPlayerSeat: nextSeat,
  pendingCalls: null,
  lastAction: {
    type: 'pass_all',
    timestamp: Date.now(),
  },
});

console.log('Advanced to next player');
process.exit(0);
