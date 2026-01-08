#!/usr/bin/env node
// Script to set up a win-on-discard test scenario
// Gives East a hand that's one tile away from winning

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

console.log('Setting up win test scenario...');

// For East (seat 0) who already has 2 melds:
// - 6竹 pung (3 tiles)
// - 3-4-5竹 chow (3 tiles)
// That's 6 tiles in melds, so concealed hand should be 11 tiles
// For a winning hand: 5 sets + 1 pair = 17 tiles total
// With 2 melds (6 tiles), need 3 sets + 1 pair = 11 tiles in hand

// Winning hand structure:
// Meld 1: 6竹 6竹 6竹 (pung) - already exposed
// Meld 2: 3竹 4竹 5竹 (chow) - already exposed
// Set 3: 1萬 2萬 3萬 (concealed chow)
// Set 4: 5萬 5萬 5萬 (concealed pung)
// Set 5: 7萬 8萬 9萬 (concealed chow)
// Pair: 4● 4● (use Gold as pair)

// Create the waiting hand (missing one tile - waiting for 9萬)
// With 2 exposed melds (6 tiles), need 10 tiles waiting + 1 discard = 11 tiles
// After discarding the extra tile, East will have 10 tiles waiting for 9萬
const waitingHand = [
  'characters_1_0', 'characters_2_0', 'characters_3_0', // Set 3: 1-2-3萬
  'characters_5_0', 'characters_5_1', 'characters_5_2', // Set 4: 5萬 pung
  'characters_7_0', 'characters_8_0',                   // Set 5: 7-8萬 (waiting for 9萬)
  'dots_4_0', 'dots_4_1',                               // Pair: 4● 4●
  'wind_east_0',                                        // Extra tile to discard
];

// The winning tile will be characters_9 (9萬)
const winningTile = 'characters_9_0';

console.log('Waiting hand (11 tiles, will discard 1, waiting for 9萬):', waitingHand.length);

// Update East's hand
await update(ref(db), {
  [`rooms/${roomCode}/privateHands/seat0/concealedTiles`]: waitingHand,
});

console.log('East hand updated to waiting hand');

// Now run through turns until North discards 9萬
async function setupNorthDiscard() {
  // First, complete current phase if needed
  let currentGame = (await get(gameRef)).val();

  // If in playing phase and it's East's turn, discard to start
  if (currentGame.phase === 'playing' && currentGame.currentPlayerSeat === 0) {
    // Need to handle the fact that East might need to discard
    console.log('East needs to discard first. Discarding 西...');

    const handRef = ref(db, `rooms/${roomCode}/privateHands/seat0`);
    const handSnap = await get(handRef);
    const hand = handSnap.val()?.concealedTiles || waitingHand;

    // Discard a non-winning tile if present
    const tileToDiscard = hand.find(t => t.startsWith('wind_')) || hand[hand.length - 1];
    const newHand = hand.filter(t => t !== tileToDiscard);

    const discardPile = [...(currentGame.discardPile || []), tileToDiscard];

    await update(ref(db), {
      [`rooms/${roomCode}/privateHands/seat0/concealedTiles`]: newHand,
      [`rooms/${roomCode}/game/discardPile`]: discardPile,
      [`rooms/${roomCode}/game/phase`]: 'calling',
      [`rooms/${roomCode}/game/pendingCalls`]: {
        seat0: 'discarder',
        seat1: null,
        seat2: null,
        seat3: null,
      },
      [`rooms/${roomCode}/game/lastAction`]: {
        type: 'discard',
        playerSeat: 0,
        tile: tileToDiscard,
        timestamp: Date.now()
      }
    });
  }

  // Run through turns until North's turn
  for (let i = 0; i < 10; i++) {
    currentGame = (await get(gameRef)).val();
    console.log(`Iteration ${i}: phase=${currentGame.phase}, seat=${currentGame.currentPlayerSeat}`);

    if (currentGame.phase === 'calling') {
      // All pass
      await update(ref(db, `rooms/${roomCode}/game/pendingCalls`), {
        seat0: currentGame.pendingCalls?.seat0 === 'discarder' ? 'discarder' : 'pass',
        seat1: currentGame.pendingCalls?.seat1 === 'discarder' ? 'discarder' : 'pass',
        seat2: currentGame.pendingCalls?.seat2 === 'discarder' ? 'discarder' : 'pass',
        seat3: currentGame.pendingCalls?.seat3 === 'discarder' ? 'discarder' : 'pass',
      });

      const discarder = currentGame.lastAction.playerSeat;
      const nextSeat = (discarder + 1) % 4;

      await update(gameRef, {
        phase: 'playing',
        currentPlayerSeat: nextSeat,
        pendingCalls: null,
      });

      continue;
    }

    if (currentGame.phase === 'playing' && currentGame.currentPlayerSeat === 3) {
      // North's turn - make them discard the winning tile!
      console.log('North is about to discard the winning tile (9萬)...');

      const northHandRef = ref(db, `rooms/${roomCode}/privateHands/seat3`);
      const northHandSnap = await get(northHandRef);
      let northHand = northHandSnap.val()?.concealedTiles || [];

      // Draw if needed
      let wall = [...(currentGame.wall || [])];
      if (northHand.length < 17) {
        const drawnTile = wall.shift();
        northHand = [...northHand, drawnTile];
      }

      // Add the winning tile to North's hand and discard it
      // First check if it's already in the wall
      const winTileIdx = wall.findIndex(t => t.startsWith('characters_9_'));
      let discardTile;
      if (winTileIdx !== -1) {
        discardTile = wall[winTileIdx];
        wall.splice(winTileIdx, 1);
        northHand.push(discardTile);
      } else {
        // Use an existing 9萬 if available
        discardTile = northHand.find(t => t.startsWith('characters_9_')) || 'characters_9_1';
        if (!northHand.includes(discardTile)) {
          northHand.push(discardTile);
        }
      }

      const newNorthHand = northHand.filter(t => t !== discardTile);
      const discardPile = [...(currentGame.discardPile || []), discardTile];

      await update(ref(db), {
        [`rooms/${roomCode}/game/wall`]: wall,
        [`rooms/${roomCode}/privateHands/seat3/concealedTiles`]: newNorthHand,
        [`rooms/${roomCode}/game/discardPile`]: discardPile,
        [`rooms/${roomCode}/game/phase`]: 'calling',
        [`rooms/${roomCode}/game/pendingCalls`]: {
          seat0: null,
          seat1: null,
          seat2: null,
          seat3: 'discarder',
        },
        [`rooms/${roomCode}/game/lastAction`]: {
          type: 'discard',
          playerSeat: 3,
          tile: discardTile,
          timestamp: Date.now()
        }
      });

      console.log(`North discarded: ${discardTile}`);
      console.log('East should now be able to WIN!');
      break;
    }

    // Other player's turn - make them draw and discard
    const seat = currentGame.currentPlayerSeat;
    const seatKey = `seat${seat}`;

    const handRef = ref(db, `rooms/${roomCode}/privateHands/${seatKey}`);
    const handSnap = await get(handRef);
    let hand = handSnap.val()?.concealedTiles || [];
    let wall = [...(currentGame.wall || [])];

    // Draw if needed
    const melds = currentGame.exposedMelds?.[seatKey]?.length || 0;
    const expectedSize = 17 - (3 * melds);
    if (hand.length < expectedSize) {
      const drawnTile = wall.shift();
      hand = [...hand, drawnTile];
    }

    // For East (seat 0), only discard wind tiles to preserve winning hand
    let tileToDiscard;
    if (seat === 0) {
      tileToDiscard = hand.find(t => t.startsWith('wind_'));
      if (!tileToDiscard) {
        console.log('East has no wind tile to discard, skipping setup');
        process.exit(1);
      }
    } else {
      // For other players, discard any non-9萬 tile
      const nonWinTiles = hand.filter(t => !t.startsWith('characters_9_'));
      tileToDiscard = nonWinTiles.length > 0 ? nonWinTiles[0] : hand[0];
    }
    const newHand = hand.filter((t, i) => i !== hand.indexOf(tileToDiscard));
    const discardPile = [...(currentGame.discardPile || []), tileToDiscard];

    await update(ref(db), {
      [`rooms/${roomCode}/game/wall`]: wall,
      [`rooms/${roomCode}/privateHands/${seatKey}/concealedTiles`]: newHand,
      [`rooms/${roomCode}/game/discardPile`]: discardPile,
      [`rooms/${roomCode}/game/phase`]: 'calling',
      [`rooms/${roomCode}/game/pendingCalls`]: {
        seat0: seat === 0 ? 'discarder' : null,
        seat1: seat === 1 ? 'discarder' : null,
        seat2: seat === 2 ? 'discarder' : null,
        seat3: seat === 3 ? 'discarder' : null,
      },
      [`rooms/${roomCode}/game/lastAction`]: {
        type: 'discard',
        playerSeat: seat,
        tile: tileToDiscard,
        timestamp: Date.now()
      }
    });

    console.log(`Seat ${seat} discarded:`, tileToDiscard);
  }
}

await setupNorthDiscard();
console.log('Win test setup complete!');
process.exit(0);
