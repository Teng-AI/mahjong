#!/usr/bin/env node
// Script to set up a turn timer test with a near-winning hand
// Player will have 2 gold tiles and win with any draw

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const user = await signInAnonymously(auth);
const userId = user.user.uid;

const roomCode = process.argv[2] || generateRoomCode();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

console.log(`Setting up timer win test in room: ${roomCode}`);

// Gold tile will be circle 7 (dots_7)
const goldTileType = 'dots_7';

// Player 0 (you) hand - 13 tiles, needs to draw
// Structure: Will have 2 gold tiles + complete melds waiting for pair
// Hand: Gold Gold + 1-2-3萬 + 4-5-6萬 + 7-8-9萬 + 1|| (need pair)
// After drawing anything, use golds to make pair -> WIN
const playerHand = [
  'dots_7_0',       // GOLD #1
  'dots_7_1',       // GOLD #2
  'characters_1_0', // 1萬
  'characters_2_0', // 2萬
  'characters_3_0', // 3萬
  'characters_4_0', // 4萬
  'characters_5_0', // 5萬
  'characters_6_0', // 6萬
  'characters_7_0', // 7萬
  'characters_8_0', // 8萬
  'characters_9_0', // 9萬
  'bamboo_1_0',     // 1||
  'bamboo_1_1',     // 1|| (pair)
];

// Bot hands - just random tiles
const bot1Hand = [
  'characters_1_1', 'characters_2_1', 'characters_3_1',
  'characters_4_1', 'characters_5_1', 'characters_6_1',
  'characters_7_1', 'characters_8_1', 'characters_9_1',
  'dots_1_0', 'dots_2_0', 'dots_3_0', 'dots_4_0',
];

const bot2Hand = [
  'bamboo_2_0', 'bamboo_3_0', 'bamboo_4_0',
  'bamboo_5_0', 'bamboo_6_0', 'bamboo_7_0',
  'bamboo_8_0', 'bamboo_9_0', 'bamboo_2_1',
  'dots_5_0', 'dots_6_0', 'dots_8_0', 'dots_9_0',
];

const bot3Hand = [
  'characters_1_2', 'characters_2_2', 'characters_3_2',
  'characters_4_2', 'characters_5_2', 'characters_6_2',
  'characters_7_2', 'characters_8_2', 'characters_9_2',
  'dots_1_1', 'dots_2_1', 'dots_3_1', 'dots_4_1',
];

// Wall - remaining tiles (simplified)
const wall = [
  'bamboo_3_1', 'bamboo_4_1', 'bamboo_5_1', 'bamboo_6_1',
  'bamboo_7_1', 'bamboo_8_1', 'bamboo_9_1',
  'dots_5_1', 'dots_6_1', 'dots_8_1', 'dots_9_1',
  'characters_1_3', 'characters_2_3', 'characters_3_3',
  'bamboo_1_2', 'bamboo_2_2', 'bamboo_3_2', 'bamboo_4_2',
];

// Create room
const roomData = {
  roomCode,
  hostId: userId,
  createdAt: Date.now(),
  status: 'playing',
  players: {
    seat0: { id: userId, name: 'You', connected: true, lastSeen: Date.now() },
    seat1: { id: 'bot1', name: 'Bot-E1', connected: true, lastSeen: Date.now(), isBot: true, botDifficulty: 'easy' },
    seat2: { id: 'bot2', name: 'Bot-E2', connected: true, lastSeen: Date.now(), isBot: true, botDifficulty: 'easy' },
    seat3: { id: 'bot3', name: 'Bot-E3', connected: true, lastSeen: Date.now(), isBot: true, botDifficulty: 'easy' },
  },
  settings: {
    dealerSeat: 0,
    callingTimerSeconds: null,
    turnTimerSeconds: 10, // 10 second turn timer for testing
  },
};

// Create game state - player 0 is dealer and needs to draw
const gameState = {
  round: 1,
  dealerSeat: 0,
  currentPlayerSeat: 0, // Your turn
  phase: 'playing',
  goldTileType,
  wall,
  discardPile: [],
  players: {
    seat0: { exposedMelds: [], bonusTiles: [] },
    seat1: { exposedMelds: [], bonusTiles: [] },
    seat2: { exposedMelds: [], bonusTiles: [] },
    seat3: { exposedMelds: [], bonusTiles: [] },
  },
  lastAction: null,
  pendingCalls: null,
  // Turn timer - starts 5 seconds from now to give time to open browser
  turnStartTime: Date.now() + 5000,
  turnTimerSeconds: 30, // 30 seconds to give time to observe
};

// Private hands
const privateHands = {
  seat0: { concealedTiles: playerHand },
  seat1: { concealedTiles: bot1Hand },
  seat2: { concealedTiles: bot2Hand },
  seat3: { concealedTiles: bot3Hand },
};

// Write to Firebase
await set(ref(db, `rooms/${roomCode}`), roomData);
await set(ref(db, `rooms/${roomCode}/game`), gameState);
await set(ref(db, `rooms/${roomCode}/privateHands`), privateHands);

console.log('');
console.log('=== TIMER WIN TEST SETUP COMPLETE ===');
console.log(`Room Code: ${roomCode}`);
console.log(`Gold Tile: 7● (dots_7)`);
console.log('');
console.log('Your hand (13 tiles):');
console.log('  - 7● 7● (2 GOLD TILES!)');
console.log('  - 1-2-3萬 (sequence)');
console.log('  - 4-5-6萬 (sequence)');
console.log('  - 7-8-9萬 (sequence)');
console.log('  - 1|| 1|| (pair)');
console.log('');
console.log('This is a WINNING HAND! After drawing ANY tile:');
console.log('  - 3 sequences + 1 pair + 2 golds = WIN');
console.log('');
console.log('Turn timer: 30 seconds (starts in 5 seconds)');
console.log('Open the URL quickly, then wait for timer to expire - auto-play should WIN!');
console.log('');
console.log(`Open: http://localhost:3000/game/${roomCode}?seat=0`);
console.log('');
console.log('NOTE: Use ?seat=0 to view as player 0 (with the winning hand)');
console.log('Your user ID from script:', userId);
console.log('');

process.exit(0);
