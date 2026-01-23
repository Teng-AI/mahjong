# Clean Room Re-Implementation Plan

## Problem Statement
Re-implement stable features from `feature/reconnection-handling` branch without the buggy auto-pilot system.

---

## Lessons Learned from Feature Branch

### The Numbers Tell the Story
- **50 commits total**, **31 were fixes** (62%)
- Most fixes were fixing previous fixes
- Pattern: fix → discover new edge case → fix → repeat

### Root Causes Identified

#### 1. Firebase Gotchas (from 01-10 work log)
| Gotcha | What Happens | Solution |
|--------|--------------|----------|
| `update()` merges | Old nested fields persist | Use `set()` for atomic replacement |
| `null` deletes field | Can't store "empty" state | Use sentinel values like `'waiting'` |
| Read-after-write stale | Reading right after writing returns old data | Return new value from write function |

**Example that broke things:**
```typescript
// BAD: Firebase may return stale hand immediately after draw
const drawResult = await drawTile(roomCode, seat);
const hand = await getPrivateHand(roomCode, seat); // STALE!

// GOOD: Return new hand from drawTile itself
const drawResult = await drawTile(roomCode, seat);
const hand = drawResult.newHand; // Fresh!
```

#### 2. React Effect Gotchas (from 01-21 work log)
| Gotcha | What Happens | Solution |
|--------|--------------|----------|
| Effect-local variables reset | Tracking state lost on re-render | Use `useRef` for persistence |
| Stale closures | Callbacks capture old values | Use refs or include in deps |
| Async setState | State not updated immediately | Use ref for synchronous guards |
| StrictMode double-run | Effects run twice in dev | Make effects idempotent |

**Example that broke things:**
```typescript
// BAD: Variables reset when effect re-runs
useEffect(() => {
  let submittedForTurn = null; // RESETS on every dependency change!
  // ...
}, [room?.players]); // Changes often due to autoPilotSince updates

// GOOD: Use ref to persist across re-runs
const submittedForTurnRef = useRef<number | null>(null);
useEffect(() => {
  // submittedForTurnRef.current persists
}, [room?.players]);
```

#### 3. Architecture Problems
| Problem | Why It Happened | Better Approach |
|---------|-----------------|-----------------|
| Two timer mechanisms | Added auto-pilot ON TOP of existing timers | Should have replaced, not layered |
| Race conditions everywhere | Multiple systems could trigger same action | Single source of truth for actions |
| 20+ fix commits | Kept patching instead of redesigning | Step back, understand root cause |

**The core architecture mistake:**
```
BEFORE (broken):
  Timer expires → autoPlayExpiredTurn() → takes action
  Auto-pilot active → separate interval → also takes action
  Bot runner → also watches for turns → also takes action
  = THREE systems competing to take the same action

BETTER:
  Single action coordinator that decides:
  - Is it a bot's turn? → bot runner handles
  - Is it a human's turn? → human acts OR timer expires
  - Only ONE system ever triggers an action
```

### Process Anti-Patterns
1. **Jumped into coding** - Auto-pilot was "easy" (20 lines), turned into 20+ fixes
2. **Patched instead of redesigned** - Each fix revealed new edge cases
3. **Didn't read Firebase docs** - `update()` behavior surprised us
4. **Didn't test incrementally** - Shipped whole feature, then debugged

### What Would Have Helped
1. **Pre-implementation plan** with Firebase behavior research
2. **Smaller incremental PRs** - connection detection separate from auto-pilot
3. **Integration tests** for timer/action interactions
4. **Single responsibility** - one system owns action-taking

---

## Feature Analysis

### Features by Risk Level

| Risk | Feature | Files | Notes |
|------|---------|-------|-------|
| 🟢 Low | Component extraction (refactors) | `components/game/*.tsx` | Pure UI, no state logic |
| 🟢 Low | Timer minimum lowered to 5s | `lib/rooms.ts` | Trivial change |
| 🟢 Low | Docs/changelog updates | `*.md` | Documentation only |
| 🟡 Medium | Firebase connection hook | `useFirebaseConnection.ts` | Self-contained, well-tested pattern |
| 🟡 Medium | Connection banner UI | `ConnectionBanner.tsx` | Pure UI component |
| 🟡 Medium | Spectator mode | `SpectatorView.tsx` | Large but mostly display logic |
| 🟡 Medium | Presence/lastSeen tracking | `useRoom.ts` | Adds onDisconnect handlers |
| 🔴 High | Auto-pilot system | Multiple files | Root cause of issues |
| 🔴 High | Auto-play timer enforcement | `game.ts`, `page.tsx` | Deeply integrated with auto-pilot |
| 🔴 High | Bot deduplication fixes | `useBotRunner.ts` | Attempts to fix race conditions |

### Dependency Graph

```
Component Extraction (Low)
    └── No dependencies, pure refactors

Firebase Connection Hook (Medium)
    └── No dependencies, standalone

Connection Banner (Medium)
    └── Depends on: ConnectionStatus type, useFirebaseConnection

Presence Tracking (Medium)
    └── Depends on: ConnectionStatus type
    └── Feeds into: Auto-pilot (HIGH RISK - skip this dependency)

Spectator Mode (Medium)
    └── Depends on: Extracted components, Connection banner
    └── Contains: Auto-pilot badge display (can omit)

Auto-Pilot System (HIGH RISK - DO NOT IMPLEMENT)
    └── autoPilotSince field
    └── clearAutoPilot functions
    └── autoPlayExpiredTurn integration
    └── All the race condition "fixes"
```

## Re-Implementation Plan

### Phase 1: Low-Risk Refactors (Safe)
**Commit 1: Extract reusable game components**
- Create `components/game/RoundEndActions.tsx`
- Create `components/game/ScoreBreakdown.tsx`
- Create `components/game/SessionScoresTable.tsx`
- Create `components/game/WinningHand.tsx`
- Create `components/game/GameLogTabs.tsx`
- Update `components/game/index.ts`

**Commit 2: Lower minimum timer to 5 seconds**
- Update `lib/rooms.ts` validation

### Phase 2: Connection Status (Medium Risk)
**Commit 3: Add Firebase connection monitoring**
- Create `types/index.ts` - add `ConnectionStatus` type
- Create `hooks/useFirebaseConnection.ts`
- Create `components/ConnectionBanner.tsx`

**Commit 4: Add presence tracking to useRoom**
- Update `useRoom.ts` with onDisconnect handlers
- Update `lib/rooms.ts` with `updatePlayerConnection` changes
- **SKIP**: autoPilotSince field and related logic

### Phase 3: Spectator Mode (Medium Risk)
**Commit 5: Add SpectatorView component**
- Create `components/SpectatorView.tsx`
- Uses extracted game components
- **OMIT**: Auto-pilot badge display

**Commit 6: Integrate spectator mode into game page**
- Add spectator detection logic
- Route non-players to SpectatorView
- Add connection banner to game page

### Phase 4: Timer Display for Spectators
**Commit 7: Add timer countdown to SpectatorView**
- Display-only timer countdown (no enforcement logic)
- Spectators see same timer UI as players
- Timer enforcement already works in main via `useTurnTimer` and `useCallingTimer` hooks

**Verification (before starting):**
Timer enforcement already exists in main:
- `hooks/useTurnTimer.ts` - Turn timer with `onExpire` callback
- `hooks/useCallingTimer.ts` - Calling timer with `onExpire` callback
- `lib/game.ts:autoPlayExpiredTurn()` - Auto-draw/discard logic
- **No changes needed** - we're just adding spectator display

## What to EXPLICITLY SKIP

1. **autoPilotSince field** - Don't add to RoomPlayer type
2. **clearAutoPilot functions** - Don't add to rooms.ts
3. **Auto-pilot detection** - Don't add `isOnAutoPilot()` function
4. **Auto-pilot badges** - Don't show [Auto] indicator
5. **autoPlayExpiredTurn modifications** - Keep original behavior
6. **Bot deduplication refs** - These were bandaids for auto-pilot issues
7. **providedHand parameter** - This was a workaround for race conditions
8. **DEBUG_GAME_ACTIONS logging** - Diagnostic code for race conditions

## Test Plan

After each commit:
1. Run `npm test` - all existing tests pass
2. Run `npm run build` - no TypeScript errors
3. Manual test: Create room, play a round
4. Manual test: Connection banner appears on network disconnect
5. Manual test: Spectator can view game without affecting it

## User Decisions (Confirmed)

1. ✅ **Turn timers should auto-pass** when timer expires
2. ✅ **Spectator mode full-featured** (show all exposed tiles, scores, etc.)

---

## Timer Enforcement: The Right Way

### What Worked (Before Auto-Pilot)
The original timer enforcement was simple:
- `useTurnTimer` hook tracks time remaining
- When timer expires → calls `autoPlayExpiredTurn()` ONCE
- Bot runner handles bot turns separately
- **One system per responsibility**

### What Broke It (Auto-Pilot)
Auto-pilot added a SECOND mechanism:
- Disconnected player → auto-pilot activates
- Auto-pilot has its OWN interval → calls actions
- Now TWO systems can trigger same action → race conditions

### Clean Implementation
Keep the original simple design:
```
Human's turn:
  → useTurnTimer counts down
  → Timer expires → autoPlayExpiredTurn() (ONCE)
  → No auto-pilot, no second mechanism

Bot's turn:
  → useBotRunner handles it
  → Timer display only (bots don't need timers)

Disconnected human:
  → Timer still runs down normally
  → autoPlayExpiredTurn() fires when it expires
  → No special "auto-pilot" mode needed
```

**Key insight:** A disconnected player doesn't need "auto-pilot." The timer already handles it—when it expires, auto-play happens. Auto-pilot was solving a problem that didn't exist.

---

## Risk Mitigation

- **Small commits**: Each feature is one commit, easy to revert
- **Test after each**: Run tests before moving to next phase
- **Skip auto-pilot entirely**: The root cause of issues
- **Keep feature branch**: Reference for exact implementations
