import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update, set } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const roomCode = process.argv[2] || 'CAXADC';
const winningSeat = parseInt(process.argv[3] || '1', 10);  // seat 0-3, defaults to 1
const winningScore = parseInt(process.argv[4] || '2', 10);  // points, defaults to 2

const seatNames = ['East', 'South', 'West', 'North'];

async function forceWin() {
  // Authenticate
  await signInAnonymously(auth);
  console.log('Authenticated');

  // Validate seat
  if (winningSeat < 0 || winningSeat > 3) {
    console.error('Invalid seat. Must be 0-3');
    process.exit(1);
  }

  // Get current game state
  const gameRef = ref(db, `rooms/${roomCode}/game`);
  const gameSnap = await get(gameRef);
  const gameState = gameSnap.val();

  if (!gameState) {
    console.error('Game not found');
    process.exit(1);
  }

  // Get winning seat's current hand
  const handRef = ref(db, `rooms/${roomCode}/privateHands/seat${winningSeat}`);
  const handSnap = await get(handRef);
  const hand = handSnap.val();

  console.log(`Current hand for seat ${winningSeat}:`, hand?.concealedTiles?.slice(0, 5), '...');

  // Create a winning hand - 4 pungs + 1 pair = 14 tiles
  const winningHand = [
    'dots_1_0', 'dots_1_1', 'dots_1_2',  // pung of 1 dots
    'dots_2_0', 'dots_2_1', 'dots_2_2',  // pung of 2 dots
    'dots_3_0', 'dots_3_1', 'dots_3_2',  // pung of 3 dots
    'bamboo_1_0', 'bamboo_1_1', 'bamboo_1_2',  // pung of 1 bamboo
    'bamboo_2_0', 'bamboo_2_1'  // pair of 2 bamboo
  ];

  // Update winning seat's hand
  await set(handRef, { concealedTiles: winningHand });
  console.log(`Updated seat ${winningSeat} hand to winning hand`);

  // Set winner info
  const winner = {
    seat: winningSeat,
    isSelfDraw: true,
    isThreeGolds: false,
    hand: winningHand,
    score: {
      base: 1,
      bonusTiles: 0,
      golds: 0,
      subtotal: 1,
      multiplier: winningScore,
      total: winningScore
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

  // Record round result for cumulative scoring
  const sessionRef = ref(db, `rooms/${roomCode}/session`);
  const sessionSnap = await get(sessionRef);
  let session = sessionSnap.exists() ? sessionSnap.val() : {
    rounds: [],
    cumulative: { seat0: 0, seat1: 0, seat2: 0, seat3: 0 }
  };

  // Get player name
  const playerRef = ref(db, `rooms/${roomCode}/players/seat${winningSeat}`);
  const playerSnap = await get(playerRef);
  const playerName = playerSnap.exists() ? playerSnap.val().name : `Player ${winningSeat + 1}`;

  // Create round record
  const roundNumber = (session.rounds?.length || 0) + 1;
  const round = {
    roundNumber,
    winnerSeat: winningSeat,
    winnerName: playerName,
    score: winningScore,
    timestamp: Date.now()
  };

  // Update cumulative scores
  const newCumulative = { ...session.cumulative };
  newCumulative[`seat${winningSeat}`] = (newCumulative[`seat${winningSeat}`] || 0) + winningScore;

  // Save session
  await update(sessionRef, {
    rounds: [...(session.rounds || []), round],
    cumulative: newCumulative
  });

  console.log(`\nGame ended! Seat ${winningSeat} (${seatNames[winningSeat]}) wins with ${winningScore} points!`);
  console.log(`Session recorded: Round ${roundNumber}`);
  console.log(`Cumulative scores:`, newCumulative);
  console.log(`Refresh browser tabs to see winner page.`);
  process.exit(0);
}

forceWin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
