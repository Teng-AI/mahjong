"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCallingPhaseStart = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.database();
const DEFAULT_CALL_TIMER = 30; // seconds
/**
 * Triggered when callingPhaseStartTime is set in the game state.
 * Waits for the timer duration, then auto-passes any players who haven't responded.
 */
exports.onCallingPhaseStart = functions.database
    .ref('/rooms/{roomCode}/game/callingPhaseStartTime')
    .onWrite(async (change, context) => {
    var _a;
    const roomCode = context.params.roomCode;
    // Only proceed if callingPhaseStartTime was just set (not deleted)
    if (!change.after.exists()) {
        console.log(`[${roomCode}] callingPhaseStartTime deleted, ignoring`);
        return null;
    }
    const startTime = change.after.val();
    const currentTime = Date.now();
    // Get the activeCallTimer from game state (set when calling phase started)
    const initialGameSnapshot = await db.ref(`/rooms/${roomCode}/game`).once('value');
    const initialGameState = initialGameSnapshot.val();
    const timerSeconds = (_a = initialGameState === null || initialGameState === void 0 ? void 0 : initialGameState.activeCallTimer) !== null && _a !== void 0 ? _a : DEFAULT_CALL_TIMER;
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
    const pendingCalls = gameState.pendingCalls;
    if (!pendingCalls) {
        console.log(`[${roomCode}] No pending calls`);
        return null;
    }
    // Find players who haven't responded and auto-pass them
    const updates = {};
    const seats = [0, 1, 2, 3];
    for (const seat of seats) {
        const seatKey = `seat${seat}`;
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
    }
    else {
        console.log(`[${roomCode}] All players have already responded`);
    }
    return null;
});
//# sourceMappingURL=index.js.map