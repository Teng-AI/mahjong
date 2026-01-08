#!/usr/bin/env node
// Script to set up a chow test scenario
// Makes North discard 4竹 which East can chow with 3竹-5竹

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

console.log('Current phase:', game.phase);
console.log('Current seat:', game.currentPlayerSeat);

// First, complete current player's turn if it's East (seat 0)
if (game.currentPlayerSeat === 0 && game.phase === 'playing') {
  // Get East's hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat0`);
  const handSnap = await get(handRef);
  const hand = handSnap.val()?.concealedTiles || [];

  console.log('East hand:', hand.length, 'tiles');

  // Check if East needs to draw
  if (hand.length === 13) {
    // Draw a tile
    const wall = [...(game.wall || [])];
    const drawnTile = wall.shift();
    const newHand = [...hand, drawnTile];

    console.log('East drew:', drawnTile);

    await update(ref(db), {
      [`rooms/${roomCode}/game/wall`]: wall,
      [`rooms/${roomCode}/privateHands/seat0/concealedTiles`]: newHand,
      [`rooms/${roomCode}/game/lastAction`]: {
        type: 'draw',
        playerSeat: 0,
        timestamp: Date.now()
      }
    });

    // Now discard a tile (pick one that's not useful)
    const tileToDiscard = newHand.find(t => t.startsWith('dots_8')) || newHand[0];
    const finalHand = newHand.filter((t, i) => i !== newHand.indexOf(tileToDiscard));
    const discardPile = [...(game.discardPile || []), tileToDiscard];

    // Set up calling phase
    const pendingCalls = {
      seat0: 'discarder',
      seat1: null,
      seat2: null,
      seat3: null,
    };

    await update(ref(db), {
      [`rooms/${roomCode}/privateHands/seat0/concealedTiles`]: finalHand,
      [`rooms/${roomCode}/game/discardPile`]: discardPile,
      [`rooms/${roomCode}/game/phase`]: 'calling',
      [`rooms/${roomCode}/game/pendingCalls`]: pendingCalls,
      [`rooms/${roomCode}/game/lastAction`]: {
        type: 'discard',
        playerSeat: 0,
        tile: tileToDiscard,
        timestamp: Date.now()
      }
    });

    console.log('East discarded:', tileToDiscard);
    console.log('Now in calling phase');
  }
}

// Now run turns until it's North's turn, then have North discard 4竹
async function runUntilNorthDiscardsChowable() {
  let currentGame = (await get(gameRef)).val();

  while (currentGame.currentPlayerSeat !== 3 || currentGame.phase !== 'playing') {
    console.log(`Current: seat ${currentGame.currentPlayerSeat}, phase: ${currentGame.phase}`);

    if (currentGame.phase === 'calling') {
      // All pass
      await update(ref(db, `rooms/${roomCode}/game/pendingCalls`), {
        seat0: currentGame.pendingCalls?.seat0 === 'discarder' ? 'discarder' : 'pass',
        seat1: currentGame.pendingCalls?.seat1 === 'discarder' ? 'discarder' : 'pass',
        seat2: currentGame.pendingCalls?.seat2 === 'discarder' ? 'discarder' : 'pass',
        seat3: currentGame.pendingCalls?.seat3 === 'discarder' ? 'discarder' : 'pass',
      });

      // Advance to next player
      const nextSeat = (currentGame.lastAction.playerSeat + 1) % 4;
      await update(gameRef, {
        phase: 'playing',
        currentPlayerSeat: nextSeat,
        pendingCalls: null,
      });

      console.log('Advanced to seat', nextSeat);
    } else if (currentGame.phase === 'playing' && currentGame.currentPlayerSeat !== 3) {
      // Bot turn
      const seat = currentGame.currentPlayerSeat;
      const seatKey = `seat${seat}`;

      const handRef = ref(db, `rooms/${roomCode}/privateHands/${seatKey}`);
      const handSnap = await get(handRef);
      const hand = handSnap.val()?.concealedTiles || [];

      let finalHand = hand;
      let wall = [...(currentGame.wall || [])];

      // Draw if needed
      if (hand.length === 16 - (3 * (currentGame.exposedMelds?.[seatKey]?.length || 0))) {
        const drawnTile = wall.shift();
        finalHand = [...hand, drawnTile];
        console.log(`Seat ${seat} drew:`, drawnTile);
      }

      // Discard
      const tileToDiscard = finalHand[Math.floor(Math.random() * finalHand.length)];
      const newHand = finalHand.filter((t, i) => i !== finalHand.indexOf(tileToDiscard));
      const discardPile = [...(currentGame.discardPile || []), tileToDiscard];

      const pendingCalls = {
        seat0: seat === 0 ? 'discarder' : null,
        seat1: seat === 1 ? 'discarder' : null,
        seat2: seat === 2 ? 'discarder' : null,
        seat3: seat === 3 ? 'discarder' : null,
      };

      await update(ref(db), {
        [`rooms/${roomCode}/game/wall`]: wall,
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

      console.log(`Seat ${seat} discarded:`, tileToDiscard);
    }

    currentGame = (await get(gameRef)).val();
  }

  console.log('Now at North (seat 3) playing phase');

  // North draws and discards 4竹
  const northHandRef = ref(db, `rooms/${roomCode}/privateHands/seat3`);
  const northHandSnap = await get(northHandRef);
  let northHand = northHandSnap.val()?.concealedTiles || [];

  currentGame = (await get(gameRef)).val();
  let wall = [...(currentGame.wall || [])];

  // Draw if needed
  if (northHand.length === 16) {
    const drawnTile = wall.shift();
    northHand = [...northHand, drawnTile];
    console.log('North drew:', drawnTile);
  }

  // Add bamboo_4 to North's hand if not present, and discard it
  let tileToDiscard = northHand.find(t => t.startsWith('bamboo_4_'));
  if (!tileToDiscard) {
    // Find any bamboo_4 in wall and swap
    const bamboo4InWall = wall.findIndex(t => t.startsWith('bamboo_4_'));
    if (bamboo4InWall !== -1) {
      tileToDiscard = wall[bamboo4InWall];
      wall.splice(bamboo4InWall, 1);
      northHand.push(tileToDiscard);
      console.log('Added', tileToDiscard, 'to North hand');
    } else {
      // Just use characters_6 which East can also chow
      tileToDiscard = northHand.find(t => t.startsWith('characters_6_')) ||
                       northHand.find(t => t.startsWith('characters_2_')) ||
                       northHand[0];
    }
  }

  console.log('North will discard:', tileToDiscard);

  // North discards
  const newNorthHand = northHand.filter((t, i) => i !== northHand.indexOf(tileToDiscard));
  const discardPile = [...(currentGame.discardPile || []), tileToDiscard];

  const pendingCalls = {
    seat0: null,
    seat1: null,
    seat2: null,
    seat3: 'discarder',
  };

  await update(ref(db), {
    [`rooms/${roomCode}/game/wall`]: wall,
    [`rooms/${roomCode}/privateHands/seat3/concealedTiles`]: newNorthHand,
    [`rooms/${roomCode}/game/discardPile`]: discardPile,
    [`rooms/${roomCode}/game/phase`]: 'calling',
    [`rooms/${roomCode}/game/pendingCalls`]: pendingCalls,
    [`rooms/${roomCode}/game/lastAction`]: {
      type: 'discard',
      playerSeat: 3,
      tile: tileToDiscard,
      timestamp: Date.now()
    }
  });

  console.log('North discarded:', tileToDiscard);
  console.log('East (you) should now be able to CHOW with 3竹-5竹 if discard is 4竹');
}

await runUntilNorthDiscardsChowable();
process.exit(0);
