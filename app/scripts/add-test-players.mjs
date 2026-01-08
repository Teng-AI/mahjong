#!/usr/bin/env node
// Script to add test players to a room for testing multiplayer functionality

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, get } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Sign in anonymously first
console.log('Signing in anonymously...');
await signInAnonymously(auth);
console.log('Signed in!');

async function addTestPlayers(roomCode) {
  console.log(`Adding test players to room ${roomCode}...`);

  // Check if room exists
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    console.error(`Room ${roomCode} not found!`);
    process.exit(1);
  }

  const room = snapshot.val();
  console.log('Current room state:', JSON.stringify(room.players, null, 2));

  // Add fake players to empty seats
  const updates = {};
  const fakePlayers = [
    { id: 'test-player-2', name: 'Bot South' },
    { id: 'test-player-3', name: 'Bot West' },
    { id: 'test-player-4', name: 'Bot North' },
  ];

  const seats = ['seat1', 'seat2', 'seat3'];
  let playerIndex = 0;

  for (const seat of seats) {
    if (!room.players[seat]) {
      const player = fakePlayers[playerIndex];
      updates[`rooms/${roomCode}/players/${seat}`] = {
        id: player.id,
        name: player.name,
        connected: true,
        lastSeen: Date.now()
      };
      console.log(`Adding ${player.name} to ${seat}`);
      playerIndex++;
    }
  }

  if (Object.keys(updates).length === 0) {
    console.log('All seats are already filled!');
  } else {
    await update(ref(db), updates);
    console.log('Test players added successfully!');
  }

  // Verify
  const newSnapshot = await get(roomRef);
  console.log('Updated room state:', JSON.stringify(newSnapshot.val().players, null, 2));

  process.exit(0);
}

// Get room code from command line
const roomCode = process.argv[2];
if (!roomCode) {
  console.error('Usage: node add-test-players.mjs <ROOM_CODE>');
  process.exit(1);
}

addTestPlayers(roomCode);
