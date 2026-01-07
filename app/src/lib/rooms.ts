import { ref, set, get, update, serverTimestamp, onValue, off } from 'firebase/database';
import { db } from '@/firebase/config';
import { Room, RoomPlayer, SeatIndex, RoomStatus } from '@/types';

// ============================================
// ROOM CODE GENERATION
// ============================================

/**
 * Generate a random 6-character room code
 * Uses characters that are easy to read and type (no 0/O, 1/I/L confusion)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ============================================
// ROOM CREATION
// ============================================

/**
 * Create a new room with the given host
 */
export async function createRoom(hostId: string, hostName: string): Promise<string> {
  // Generate unique room code
  let roomCode = generateRoomCode();
  let attempts = 0;
  const maxAttempts = 10;

  // Check if code already exists (unlikely but possible)
  while (attempts < maxAttempts) {
    const existingRoom = await get(ref(db, `rooms/${roomCode}`));
    if (!existingRoom.exists()) {
      break;
    }
    roomCode = generateRoomCode();
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique room code');
  }

  // Create room data
  const roomData: Room = {
    roomCode,
    hostId,
    createdAt: Date.now(),
    status: 'waiting',
    players: {
      seat0: {
        id: hostId,
        name: hostName,
        connected: true,
        lastSeen: Date.now(),
      },
      seat1: null,
      seat2: null,
      seat3: null,
    },
    settings: {
      dealerSeat: 0,
    },
  };

  // Write to Firebase
  await set(ref(db, `rooms/${roomCode}`), roomData);

  return roomCode;
}

// ============================================
// ROOM JOINING
// ============================================

/**
 * Join an existing room
 * Returns the seat index assigned to the player
 */
export async function joinRoom(
  roomCode: string,
  userId: string,
  userName: string
): Promise<{ seat: SeatIndex; room: Room }> {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }

  const room = snapshot.val() as Room;

  // Check if game already started
  if (room.status !== 'waiting') {
    throw new Error('Game already in progress');
  }

  // Check if user is already in the room
  for (let i = 0; i < 4; i++) {
    const seat = `seat${i}` as keyof typeof room.players;
    if (room.players[seat]?.id === userId) {
      // User already in room, just update connection status
      await update(ref(db, `rooms/${roomCode}/players/${seat}`), {
        connected: true,
        lastSeen: Date.now(),
      });
      return { seat: i as SeatIndex, room };
    }
  }

  // Find empty seat
  let emptySeat: SeatIndex | null = null;
  for (let i = 0; i < 4; i++) {
    const seat = `seat${i}` as keyof typeof room.players;
    if (!room.players[seat]) {
      emptySeat = i as SeatIndex;
      break;
    }
  }

  if (emptySeat === null) {
    throw new Error('Room is full');
  }

  // Join the seat
  const playerData: RoomPlayer = {
    id: userId,
    name: userName,
    connected: true,
    lastSeen: Date.now(),
  };

  await set(ref(db, `rooms/${roomCode}/players/seat${emptySeat}`), playerData);

  // Return updated room
  const updatedSnapshot = await get(roomRef);
  return { seat: emptySeat, room: updatedSnapshot.val() as Room };
}

// ============================================
// ROOM UPDATES
// ============================================

/**
 * Update player connection status
 */
export async function updatePlayerConnection(
  roomCode: string,
  seat: SeatIndex,
  connected: boolean
): Promise<void> {
  await update(ref(db, `rooms/${roomCode}/players/seat${seat}`), {
    connected,
    lastSeen: Date.now(),
  });
}

/**
 * Update player name
 */
export async function updatePlayerName(
  roomCode: string,
  seat: SeatIndex,
  name: string
): Promise<void> {
  await update(ref(db, `rooms/${roomCode}/players/seat${seat}`), {
    name,
  });
}

/**
 * Set dealer (host only)
 */
export async function setDealer(
  roomCode: string,
  dealerSeat: SeatIndex
): Promise<void> {
  await update(ref(db, `rooms/${roomCode}/settings`), {
    dealerSeat,
  });
}

/**
 * Update room status
 */
export async function updateRoomStatus(
  roomCode: string,
  status: RoomStatus
): Promise<void> {
  await update(ref(db, `rooms/${roomCode}`), {
    status,
  });
}

/**
 * Leave room (remove player from seat)
 */
export async function leaveRoom(
  roomCode: string,
  seat: SeatIndex
): Promise<void> {
  await set(ref(db, `rooms/${roomCode}/players/seat${seat}`), null);
}

/**
 * Remove a player from room (host only)
 * This is the same as leaveRoom but semantically different
 */
export async function removePlayer(
  roomCode: string,
  seat: SeatIndex
): Promise<void> {
  await set(ref(db, `rooms/${roomCode}/players/seat${seat}`), null);
}

// ============================================
// ROOM QUERIES
// ============================================

/**
 * Get room data once
 */
export async function getRoom(roomCode: string): Promise<Room | null> {
  const snapshot = await get(ref(db, `rooms/${roomCode}`));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as Room;
}

/**
 * Check if room exists
 */
export async function roomExists(roomCode: string): Promise<boolean> {
  const snapshot = await get(ref(db, `rooms/${roomCode}`));
  return snapshot.exists();
}

/**
 * Get player count in room
 */
export function getPlayerCount(room: Room): number {
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const seat = `seat${i}` as keyof typeof room.players;
    if (room.players[seat]) {
      count++;
    }
  }
  return count;
}

/**
 * Check if room is full
 */
export function isRoomFull(room: Room): boolean {
  return getPlayerCount(room) === 4;
}

/**
 * Check if user is host
 */
export function isHost(room: Room, userId: string): boolean {
  return room.hostId === userId;
}

/**
 * Find user's seat in room
 */
export function findUserSeat(room: Room, userId: string): SeatIndex | null {
  for (let i = 0; i < 4; i++) {
    const seat = `seat${i}` as keyof typeof room.players;
    if (room.players[seat]?.id === userId) {
      return i as SeatIndex;
    }
  }
  return null;
}

// ============================================
// REAL-TIME SUBSCRIPTION
// ============================================

/**
 * Subscribe to room changes
 * Returns unsubscribe function
 */
export function subscribeToRoom(
  roomCode: string,
  callback: (room: Room | null) => void
): () => void {
  const roomRef = ref(db, `rooms/${roomCode}`);

  const listener = onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as Room);
    } else {
      callback(null);
    }
  });

  // Return unsubscribe function
  return () => off(roomRef);
}
