import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, update, remove } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const roomCode = process.argv[2] || 'MW2EDD';
const dealerSeat = parseInt(process.argv[3] || '1', 10);  // defaults to seat 1 (rotating from 0)

// Tile definitions (simplified)
const suits = ['dots', 'bamboo', 'characters'];
const createSuitTiles = () => {
  const tiles = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push(`${suit}_${rank}_${copy}`);
      }
    }
  }
  return tiles;
};

const createHonorTiles = () => {
  const tiles = [];
  const winds = ['east', 'south', 'west', 'north'];
  const dragons = ['red', 'green', 'white'];
  for (const wind of winds) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(`wind_${wind}_${copy}`);
    }
  }
  for (const dragon of dragons) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(`dragon_${dragon}_${copy}`);
    }
  }
  return tiles;
};

const createBonusTiles = () => {
  const tiles = [];
  const flowers = ['plum', 'orchid', 'chrysanthemum', 'bamboo'];
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  flowers.forEach((flower, i) => tiles.push(`flower_${flower}_${i}`));
  seasons.forEach((season, i) => tiles.push(`season_${season}_${i}`));
  return tiles;
};

const shuffle = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

async function restartGame() {
  await signInAnonymously(auth);
  console.log('Authenticated');

  // Create full deck
  const allTiles = [...createSuitTiles(), ...createHonorTiles(), ...createBonusTiles()];
  const shuffledTiles = shuffle(allTiles);

  // Deal 16 tiles to each player (dealer gets 17)
  const hands = {
    seat0: shuffledTiles.slice(0, dealerSeat === 0 ? 17 : 16),
    seat1: shuffledTiles.slice(dealerSeat === 0 ? 17 : 16, dealerSeat <= 1 ? 33 : 32),
    seat2: shuffledTiles.slice(dealerSeat <= 1 ? 33 : 32, dealerSeat <= 2 ? 49 : 48),
    seat3: shuffledTiles.slice(dealerSeat <= 2 ? 49 : 48, 65),
  };
  
  // Adjust for dealer getting extra tile
  if (dealerSeat === 1) hands.seat1 = shuffledTiles.slice(16, 33);
  if (dealerSeat === 2) hands.seat2 = shuffledTiles.slice(32, 49);
  if (dealerSeat === 3) hands.seat3 = shuffledTiles.slice(48, 65);

  // Remaining tiles go to wall
  const wall = shuffledTiles.slice(65);

  // Initialize new game state
  const gameState = {
    phase: 'bonusExposure',
    bonusExposureSeat: dealerSeat,
    dealerSeat: dealerSeat,
    currentPlayerSeat: dealerSeat,
    wall: wall,
    discardPile: [],
    exposedMelds: { seat0: [], seat1: [], seat2: [], seat3: [] },
    exposedBonusTiles: { seat0: [], seat1: [], seat2: [], seat3: [] },
    goldTileType: null,
    winner: null,
    lastAction: null,
    pendingCalls: null,
    turnState: 'mustDraw'
  };

  // Update game state
  await set(ref(db, `rooms/${roomCode}/game`), gameState);
  console.log(`New game initialized with dealer at seat ${dealerSeat}`);

  // Update private hands
  for (let seat = 0; seat < 4; seat++) {
    await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
      concealedTiles: hands[`seat${seat}`]
    });
  }
  console.log('Hands dealt to all players');

  // Update room status
  await update(ref(db, `rooms/${roomCode}`), { status: 'playing' });

  console.log(`\nGame restarted! Dealer is now seat ${dealerSeat}`);
  console.log('Refresh browser tabs to start playing.');
  process.exit(0);
}

restartGame().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
