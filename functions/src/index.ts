import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.database();

// Types matching the app
type SeatIndex = 0 | 1 | 2 | 3;
type CallAction = 'pass' | 'chow' | 'pung' | 'kong' | 'win';

interface PendingCalls {
  seat0: CallAction | 'discarder' | null;
  seat1: CallAction | 'discarder' | null;
  seat2: CallAction | 'discarder' | null;
  seat3: CallAction | 'discarder' | null;
  discarderSeat: SeatIndex;
  discardedTile: string;
}

const DEFAULT_CALL_TIMER = 30; // seconds

/**
 * Triggered when callingPhaseStartTime is set in the game state.
 * Waits for the timer duration, then auto-passes any players who haven't responded.
 */
export const onCallingPhaseStart = functions.database
  .ref('/rooms/{roomCode}/game/callingPhaseStartTime')
  .onWrite(async (change, context) => {
    const roomCode = context.params.roomCode;

    // Only proceed if callingPhaseStartTime was just set (not deleted)
    if (!change.after.exists()) {
      console.log(`[${roomCode}] callingPhaseStartTime deleted, ignoring`);
      return null;
    }

    const startTime = change.after.val() as number;
    const currentTime = Date.now();

    // Get the activeCallTimer from game state (set when calling phase started)
    const initialGameSnapshot = await db.ref(`/rooms/${roomCode}/game`).once('value');
    const initialGameState = initialGameSnapshot.val();
    const timerSeconds = initialGameState?.activeCallTimer ?? DEFAULT_CALL_TIMER;

    // Calculate how long to wait
    const elapsedMs = currentTime - startTime;
    const waitMs = Math.max(0, (timerSeconds * 1000) - elapsedMs);

    console.log(`[${roomCode}] Calling phase started. Timer: ${timerSeconds}s, waiting ${waitMs}ms`);

    // Wait for the timer to expire
    await new Promise(resolve => setTimeout(resolve, waitMs));

    // Check the current game state
    const gameSnapshot = await db.ref(`/rooms/${roomCode}/game`).once('value');
    const gameState = gameSnapshot.val();

    if (!gameState) {
      console.log(`[${roomCode}] Game no longer exists`);
      return null;
    }

    // Verify we're still in calling phase and the start time matches
    if (gameState.phase !== 'calling') {
      console.log(`[${roomCode}] No longer in calling phase (phase: ${gameState.phase})`);
      return null;
    }

    if (gameState.callingPhaseStartTime !== startTime) {
      console.log(`[${roomCode}] Start time changed, this timer is stale`);
      return null;
    }

    const pendingCalls = gameState.pendingCalls as PendingCalls | null;
    if (!pendingCalls) {
      console.log(`[${roomCode}] No pending calls`);
      return null;
    }

    // Find players who haven't responded and auto-pass them
    const updates: Record<string, CallAction> = {};
    const seats: SeatIndex[] = [0, 1, 2, 3];

    for (const seat of seats) {
      const seatKey = `seat${seat}` as keyof PendingCalls;
      const call = pendingCalls[seatKey];

      // If null/undefined and not the discarder, auto-pass
      if (call === null || call === undefined) {
        updates[`/rooms/${roomCode}/game/pendingCalls/${seatKey}`] = 'pass';
        console.log(`[${roomCode}] Auto-passing seat ${seat}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
      console.log(`[${roomCode}] Auto-passed ${Object.keys(updates).length} player(s)`);
    } else {
      console.log(`[${roomCode}] All players have already responded`);
    }

    return null;
  });
