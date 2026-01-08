import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, get } from 'firebase/database';
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

// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate all 128 Fujian Mahjong tiles
function generateAllTiles() {
  const tiles = [];
  const suits = ['dots', 'bamboo', 'characters'];

  // Suit tiles: 4 copies each of 1-9 for each suit (108 total)
  for (const suit of suits) {
    for (let num = 1; num <= 9; num++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push(`${suit}_${num}_${copy}`);
      }
    }
  }

  // Wind tiles: 4 copies of each direction (16 total)
  const winds = ['east', 'south', 'west', 'north'];
  for (const wind of winds) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(`wind_${wind}_${copy}`);
    }
  }

  // Red Dragon tiles: 4 copies (4 total)
  for (let copy = 0; copy < 4; copy++) {
    tiles.push(`dragon_red_${copy}`);
  }

  // Total: 108 + 16 + 4 = 128 tiles
  return tiles;
}

// Shuffle array
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function setupTestGame() {
  console.log('Setting up test game...\n');

  // Sign in anonymously
  await signInAnonymously(auth);
  console.log('Authenticated with Firebase');

  // Generate room code
  const roomCode = generateRoomCode();
  console.log(`Room code: ${roomCode}\n`);

  // Create room with 4 players
  const roomData = {
    code: roomCode,
    createdAt: Date.now(),
    status: 'waiting',
    players: {
      seat0: {
        id: 'player1_id',
        name: 'Player1-East',
        connected: true,
        lastSeen: Date.now()
      },
      seat1: {
        id: 'player2_id',
        name: 'Player2-South',
        connected: true,
        lastSeen: Date.now()
      },
      seat2: {
        id: 'player3_id',
        name: 'Player3-West',
        connected: true,
        lastSeen: Date.now()
      },
      seat3: {
        id: 'player4_id',
        name: 'Player4-North',
        connected: true,
        lastSeen: Date.now()
      }
    }
  };

  await set(ref(db, `rooms/${roomCode}`), roomData);
  console.log('Room created with 4 players');

  // Initialize game state
  const allTiles = generateAllTiles();
  const shuffledTiles = shuffle(allTiles);

  // Deal tiles: 16 to each player, 17 to dealer (seat 0)
  const hands = [[], [], [], []];
  let tileIndex = 0;

  for (let round = 0; round < 16; round++) {
    for (let seat = 0; seat < 4; seat++) {
      hands[seat].push(shuffledTiles[tileIndex++]);
    }
  }
  // Dealer gets 17th tile
  hands[0].push(shuffledTiles[tileIndex++]);

  // Remaining tiles form the wall
  const wall = shuffledTiles.slice(tileIndex);

  // Create game state
  const gameState = {
    phase: 'bonus_exposure',
    goldTileType: '',
    exposedGold: '',
    wall,
    discardPile: [],
    currentPlayerSeat: 0, // East starts
    dealerSeat: 0,
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

  await set(ref(db, `rooms/${roomCode}/game`), gameState);
  console.log('Game state initialized');

  // Set private hands
  for (let seat = 0; seat < 4; seat++) {
    await set(ref(db, `rooms/${roomCode}/privateHands/seat${seat}`), {
      concealedTiles: hands[seat],
    });
  }
  console.log('Hands dealt to all players');

  // Update room status
  await update(ref(db, `rooms/${roomCode}`), {
    status: 'playing',
  });
  console.log('Room status set to playing\n');

  // Output URLs
  console.log('='.repeat(60));
  console.log('GAME READY! Open these URLs in separate browser tabs:');
  console.log('='.repeat(60));
  console.log(`\nEast (Dealer):  http://localhost:3000/game/${roomCode}?seat=0`);
  console.log(`South:          http://localhost:3000/game/${roomCode}?seat=1`);
  console.log(`West:           http://localhost:3000/game/${roomCode}?seat=2`);
  console.log(`North:          http://localhost:3000/game/${roomCode}?seat=3`);
  console.log('\n' + '='.repeat(60));
  console.log(`Room Code: ${roomCode}`);
  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

setupTestGame().catch(err => {
  console.error('Error setting up test game:', err);
  process.exit(1);
});
