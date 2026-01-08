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

const roomCode = process.argv[2] || 'Z5NZ74';

// Add 3 more players to the room
const updates = {};
updates[`rooms/${roomCode}/players/seat1`] = {
  id: 'player2_id',
  name: 'Player2',
  connected: true,
  lastSeen: Date.now()
};
updates[`rooms/${roomCode}/players/seat2`] = {
  id: 'player3_id', 
  name: 'Player3',
  connected: true,
  lastSeen: Date.now()
};
updates[`rooms/${roomCode}/players/seat3`] = {
  id: 'player4_id',
  name: 'Player4', 
  connected: true,
  lastSeen: Date.now()
};

await update(ref(db), updates);
console.log('Added 3 players to room', roomCode);

// Check room status
const roomSnap = await get(ref(db, `rooms/${roomCode}`));
const room = roomSnap.val();
console.log('Players:', Object.keys(room.players).filter(k => room.players[k]).length);

process.exit(0);
