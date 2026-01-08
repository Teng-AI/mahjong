#!/usr/bin/env node
// Script to simulate a bot's complete turn (draw + discard)

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, get } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDWqXdcIJH8oWTbEu2ZU9yZYlIxHxZjCPA",
  authDomain: "mahjong-vibe.firebaseapp.com",
  databaseURL: "https://mahjong-vibe-default-rtdb.firebaseio.com",
  projectId: "mahjong-vibe",
};

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
console.log('Current seat:', game.currentPlayerSeat);

if (game.phase !== 'playing') {
  console.log('Not in playing phase');
  process.exit(1);
}

const seat = game.currentPlayerSeat;
const seatKey = `seat${seat}`;

// Get hand
const handRef = ref(db, `rooms/${roomCode}/privateHands/${seatKey}`);
const handSnap = await get(handRef);
const hand = handSnap.val()?.concealedTiles || [];

console.log(`${seatKey} has ${hand.length} tiles`);

// Check if need to draw
const needsDraw = hand.length === 16;
let finalHand = hand;

if (needsDraw) {
  // Draw a tile
  const wall = [...(game.wall || [])];
  const drawnTile = wall.shift();
  finalHand = [...hand, drawnTile];

  console.log(`Drew: ${drawnTile}`);

  // Update wall and hand
  await update(ref(db), {
    [`rooms/${roomCode}/game/wall`]: wall,
    [`rooms/${roomCode}/privateHands/${seatKey}/concealedTiles`]: finalHand,
    [`rooms/${roomCode}/game/lastAction`]: {
      type: 'draw',
      playerSeat: seat,
      timestamp: Date.now()
    }
  });
}

// Now discard a tile
const goldType = game.goldTileType;
const nonGoldTiles = finalHand.filter(t => !t.startsWith(goldType.replace('_', '_')));
const tileToDiscard = nonGoldTiles.length > 0
  ? nonGoldTiles[Math.floor(Math.random() * nonGoldTiles.length)]
  : finalHand[Math.floor(Math.random() * finalHand.length)];

// Remove from hand
const newHand = [...finalHand];
const idx = newHand.indexOf(tileToDiscard);
newHand.splice(idx, 1);

// Add to discard pile
const discardPile = [...(game.discardPile || []), tileToDiscard];

// Enter calling phase
const pendingCalls = {
  seat0: seat === 0 ? 'discarder' : null,
  seat1: seat === 1 ? 'discarder' : null,
  seat2: seat === 2 ? 'discarder' : null,
  seat3: seat === 3 ? 'discarder' : null,
};

await update(ref(db), {
  [`rooms/${roomCode}/privateHands/${seatKey}/concealedTiles`]: newHand,
  [`rooms/${roomCode}/game/discardPile`]: discardPile,
  [`rooms/${roomCode}/game/phase`]: 'calling',
  [`rooms/${roomCode}/game/pendingCalls`]: pendingCalls,
  [`rooms/${roomCode}/game/lastAction`]: {
    type: 'discard',
    playerSeat: seat,
    tile: tileToDiscard,
    timestamp: Date.now()
  }
});

console.log(`${seatKey} discarded: ${tileToDiscard}`);
console.log('Entered calling phase');

process.exit(0);
