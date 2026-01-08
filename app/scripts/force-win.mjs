import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update, set } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const roomCode = process.argv[2] || 'CAXADC';

async function forceWin() {
  // Authenticate
  await signInAnonymously(auth);
  console.log('Authenticated');

  // Get current game state
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);
  const gameState = gameSnap.val();

  if (!gameState) {
    console.error('Game not found');
    process.exit(1);
  }

  // Get seat 1's current hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat1`);
  const handSnap = await get(handRef);
  const hand = handSnap.val();

  console.log('Current hand for seat 1:', hand?.concealedTiles?.slice(0, 5), '...');

  // Create a winning hand - 4 pungs + 1 pair = 14 tiles
  const winningHand = [
    'dots_1_0', 'dots_1_1', 'dots_1_2',  // pung of 1 dots
    'dots_2_0', 'dots_2_1', 'dots_2_2',  // pung of 2 dots
    'dots_3_0', 'dots_3_1', 'dots_3_2',  // pung of 3 dots
    'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',  // pung of 1 bamboo
    'bamboo_2_0', 'bamboo_2_1'  // pair of 2 bamboo
  ];

  // Update seat 1's hand
  await set(handRef, { concealedTiles: winningHand });
  console.log('Updated seat 1 hand to winning hand');

  // Set winner info
  const winner = {
    seat: 1,
    isSelfDraw: true,
    isThreeGolds: false,
    hand: winningHand,
    score: {
      base: 1,
      bonusTiles: 0,
      golds: 0,
      subtotal: 1,
      multiplier: 2,
      total: 2
    }
  };

  // Update game state to ended with winner
  await update(gameRef, {
    phase: 'ended',
    winner: winner
  });
  console.log('Game phase set to ended');

  // Update room status
  await update(ref(db, `rooms/${roomCode}`), {
    status: 'ended'
  });

  console.log(`\nGame ended! Seat 1 (South) wins!`);
  console.log(`Refresh browser tabs to see winner page.`);
  process.exit(0);
}

forceWin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
