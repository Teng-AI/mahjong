# Fujian Mahjong — Implementation Plan

## Progress Tracker

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | Core Data Structures | ✅ Complete | Types defined in `app/src/types/index.ts` |
| 2 | Multiplayer Infrastructure | ✅ Complete | Firebase + room system |
| 3 | Game Setup | ✅ Complete | Dealing, shuffling, game initialization |
| 4 | Bonus Tile System | ✅ Complete | Exposure, replacements, Gold reveal |
| 5 | Turn Loop | ✅ Complete | Draw/discard mechanics |
| 6 | Win Detection (No Gold) | 🔲 Not Started | Basic winning hand algorithm |
| 7 | Gold Tile System | 🔲 Not Started | Gold substitution in win detection |
| 8 | Calling System | 🔲 Not Started | Chow/Pung calls |
| 9 | Scoring & Game End | 🔲 Not Started | Score calculation, payment |
| 10 | UI Polish | 🔲 Not Started | Final UI improvements |

---

## MVP Scope

### Included
- 128 tiles (108 suit + 20 bonus)
- Gold tile system (3 wildcards)
- Three Golds instant win
- Bonus tile auto-exposure with replacement chains
- Chow and Pung calls (no Kong)
- Turn-based calling with manual pass
- Multi-device multiplayer (room codes)
- Single hand per game with dealer selection
- Simplified scoring

### Deferred (see future-features.md)
- Kongs (+1/+2 scoring, replacement draws)
- Golden Pair (+30 bonus)
- No Bonus/Kong (+10 bonus)
- Multi-hand games (rounds, dealer rotation)
- Robbing the Gold

---

## Simplifications Applied

1. **No Kongs** — only Chows and Pungs
2. **No Golden Pair bonus** — just count Golds (+1 each)
3. **No "No Bonus/Kong" bonus** — removed from scoring
4. **Single hand mode** — one hand per game, dealer selected at start
5. **Turn-based calling** — all players must manually respond (no auto-pass)
6. **All melds revealed** — no hidden information in exposed sets

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React or Next.js |
| Realtime/Backend | Firebase Realtime DB or Supabase |
| Hosting | Vercel (frontend) |
| State Sync | Real-time database subscriptions |

---

## Phase 1: Core Data Structures

### Tiles (128 total)
```
Suits (108):
  dots_1 to dots_9      (4 copies each = 36)
  bamboo_1 to bamboo_9  (4 copies each = 36)
  characters_1 to characters_9 (4 copies each = 36)

Bonus (20):
  wind_east, wind_south, wind_west, wind_north (4 copies each = 16)
  season_1, season_2, season_3, season_4 (1 copy each = 4)
```

### Player State
```
{
  id: string
  name: string
  concealedTiles: Tile[]
  exposedMelds: Meld[]      // Chows and Pungs only
  bonusTiles: Tile[]        // Exposed winds/seasons
  isDealer: boolean
}
```

### Meld Types
```
{
  type: 'chow' | 'pung'
  tiles: Tile[]             // 3 tiles
  source: 'self' | 'discard'
}
```

### Game State
```
{
  roomCode: string
  players: Player[4]
  wall: Tile[]
  discardPile: Tile[]
  goldTileType: string      // e.g., "dots_5"
  exposedGold: Tile         // The flipped tile (not in play)
  currentPlayerIndex: number
  dealerIndex: number
  phase: 'waiting' | 'setup' | 'playing' | 'calling' | 'ended'
  lastDiscard: Tile | null
  pendingCalls: PlayerCall[]
}
```

**Complexity**: Low

---

## Phase 2: Multiplayer Infrastructure

### Room System
- Create room → generates 4-6 character code
- Join room → enter code, claim player slot
- 4 players required to start
- Host (room creator) can select dealer and start game

### Real-time Sync
- Game state stored in Firebase/Supabase
- All clients subscribe to room document
- Actions write to database, trigger updates to all clients
- Optimistic UI updates where appropriate

### Connection Handling
- Show connection status
- Handle disconnects gracefully
- Option to rejoin with same player slot

**Complexity**: Medium-High

---

## Phase 3: Game Setup

### Flow
1. Host clicks "Start Game"
2. Host selects dealer (already done in lobby)
3. Server shuffles 128 tiles
4. Deal 16 tiles to each player (17 to dealer)
5. Begin bonus tile exposure phase (Phase 4)
6. **After all bonus tiles resolved**: Auto-sort all hands, flip Gold tile from wall (suspense reveal)
7. Check all players for Three Golds (instant win if triggered)

### Hand Organization
- MVP: Auto-sort only (dots → bamboo → characters, by number)
- Auto-sort triggers after:
  - Bonus tile replacement complete (setup phase)
  - Drawing a tile
  - Completing a Chow or Pung
- Future: Manual drag-and-drop rearrangement

**Complexity**: Low-Medium

---

## Phase 4: Bonus Tile System

### Setup Phase (after deal, before Gold reveal)
Turn order: Dealer first, then counter-clockwise

For each player:
1. Check hand for bonus tiles (winds/seasons)
2. While hand contains bonus tiles:
   - Expose bonus tile (move to bonusTiles array)
   - Draw replacement from wall
   - If wall empty → draw game
3. Next player

After ALL players complete bonus exposure:
- Flip Gold tile from wall (reveal to all)
- Check all 4 players for Three Golds → instant win if triggered

### During Play
When a player draws a bonus tile:
1. Expose it immediately
2. Draw replacement
3. Repeat until non-bonus drawn
4. Check Three Golds after each draw

**Complexity**: Medium

---

## Phase 5: Turn Loop

### Normal Turn
1. **Draw**: Take tile from wall (skip if just took discard)
2. **Check**: Three Golds? → instant win
3. **Expose**: Any bonus tiles drawn (with replacements)
4. **Action**:
   - Discard one tile, OR
   - Declare win (if hand complete and player chooses to)

### After Discard
1. Enter "calling" phase
2. All players prompted for response
3. Wait for all responses
4. Resolve calls
5. Continue play

### Wall Exhaustion
- Last tile drawn → can still win with it
- If last tile is bonus and no replacement → draw game
- No more tiles → draw game, no payment

**Complexity**: Low-Medium

---

## Phase 6: Win Detection (No Gold)

### Winning Hand
5 sets + 1 pair = 17 tiles

Sets:
- **Chow**: 3 consecutive tiles, same suit (e.g., bamboo_2, bamboo_3, bamboo_4)
- **Pung**: 3 identical tiles (e.g., dots_7, dots_7, dots_7)

Pair:
- 2 identical tiles

### Algorithm
```
function isWinningHand(tiles[17]):
  for each possible pair in tiles:
    remaining = tiles without pair
    if canFormFiveSets(remaining):
      return true
  return false

function canFormFiveSets(tiles, setsFound = 0):
  if tiles.length == 0 and setsFound == 5:
    return true
  if tiles.length < 3:
    return false

  tile = tiles[0]

  // Try Pung
  if count(tile) >= 3:
    if canFormFiveSets(remove 3 of tile, setsFound + 1):
      return true

  // Try Chow (if suit tile)
  if isSuit(tile) and hasSequence(tile, tile+1, tile+2):
    if canFormFiveSets(remove sequence, setsFound + 1):
      return true

  return false
```

**Complexity**: Medium

---

## Phase 7: Gold Tile System

### Gold Designation
- At setup, flip one suit tile from wall
- That tile type becomes Gold (3 copies remain in play)
- Flipped tile displayed but not used

### Three Golds (Instant Win)
- If any player holds all 3 Gold tiles → automatic instant win
- Check after EVERY draw (normal, replacement, bonus)
- Cannot be declined (automatic)
- Counts as self-draw (×2)
- +20 special bonus

### Win Detection with Gold
Gold tiles can substitute for ANY tile in sets or pairs.

```
function isWinningHandWithGold(tiles[17], goldType):
  goldCount = count of goldType in tiles
  nonGoldTiles = tiles without golds

  // Try all possible substitutions
  return tryWinWithGoldSubstitution(nonGoldTiles, goldCount)
```

This is the most complex part — need to try Gold substituting for different missing tiles.

### Gold Restrictions
- Gold CANNOT be used for calling (Chow/Pung)
- Only helps complete your hand for winning

**Complexity**: High

---

## Phase 8: Calling System (Turn-Based)

### After Each Discard
1. Game enters "calling" phase
2. All 4 players see the discarded tile
3. Each player sees 4 buttons:
   - **Win** — enabled if discard completes hand
   - **Pung** — enabled if have 2 matching tiles
   - **Chow** — enabled if have 2 sequential tiles AND discarder is to your left
   - **Pass** — always enabled
4. Invalid options are **greyed out** (visible but not clickable)
5. **All players must click something** (no auto-pass)
6. Game waits for all 4 responses

### Resolution
Priority: Win > Pung > Chow

If multiple same-priority calls:
- Closest to discarder (counter-clockwise) wins
- Other callers get nothing

### After Call Resolved
- Winner takes the discarded tile
- Forms meld (expose it)
- If hand complete after Chow/Pung → can declare win (optional)
- Otherwise must discard
- Turn continues counter-clockwise from caller

### No Call
- If everyone passes, turn continues to next player (counter-clockwise from discarder)

**Complexity**: Medium

---

## Phase 9: Scoring & Game End

### Score Calculation
```
points = 1                      // Base for winning
       + bonusTiles.length      // +1 per exposed wind/season
       + goldsInHand            // +1 per Gold tile

if selfDraw:
  points = points × 2

if threeGolds:
  points = points + 20          // Special bonus (after multiplier)
```

### Payment
All 3 losers pay the winner the total points.
```
Total payment to winner = points × 3
Each loser pays = points
```

### Game End States
1. **Win** — show winner, score breakdown, payment
2. **Three Golds** — instant win, show special animation
3. **Draw** — wall exhausted, no payment, game over

### End Screen
- Winner announcement (or draw)
- Score breakdown
- "Play Again" button (creates new room or restarts)

**Complexity**: Low

---

## Phase 10: UI/UX

### Main Game Screen
```
+------------------------------------------+
|  [Player 2 - across]                     |
|  Exposed: [melds] Bonus: [tiles]         |
|                                          |
| [P1]                            [P3]     |
|                                          |
|  Discard Pile: [recent discards...]      |
|                                          |
|  Gold: [dots_5]  Wall: 45 remaining      |
|                                          |
|  Your Hand: [16-17 tiles]                |
|  Exposed: [melds] Bonus: [tiles]         |
+------------------------------------------+
```

### Call Prompt Overlay
```
+---------------------------+
|  Player X discarded [tile] |
|                           |
|  [Win]  [Pung]  [Chow]    |
|         [Pass]            |
|                           |
|  Waiting for others... 2/4|
+---------------------------+
```

### Visual Indicators
- Current player highlight
- Gold tile type prominently displayed
- Greyed out buttons for invalid actions
- Connection status
- Timer (optional, for AFK handling)

**Complexity**: Low-Medium

---

## Build Order Summary

| Phase | Description | Complexity | Dependencies |
|-------|-------------|------------|--------------|
| 1 | Data structures | Low | None |
| 2 | Multiplayer infrastructure | Medium-High | Phase 1 |
| 3 | Game setup | Low-Medium | Phase 2 |
| 4 | Bonus tile system | Medium | Phase 3 |
| 5 | Turn loop | Low-Medium | Phase 4 |
| 6 | Win detection (no Gold) | Medium | Phase 5 |
| 7 | Gold tile system | **High** | Phase 6 |
| 8 | Calling system | Medium | Phase 7 |
| 9 | Scoring & game end | Low | Phase 8 |
| 10 | UI polish | Low-Medium | Phase 9 |

### Milestones
- **After Phase 5**: Basic game loop works (draw/discard)
- **After Phase 7**: Core Fujian Mahjong playable (Gold tiles work)
- **After Phase 9**: Complete MVP

---

## Testing Checkpoints

### Phase 4
- [x] Bonus tiles auto-expose correctly (tested 2025-01-07)
- [x] Replacement chains work (tested 2025-01-07)
- [ ] Three Golds triggers during setup (not tested - requires rigged deal)

### Phase 6
- [ ] Valid winning hands detected
- [ ] Invalid hands rejected
- [ ] All set types recognized (Chow, Pung)

### Phase 7
- [ ] Gold substitution works in win detection
- [ ] Three Golds instant win triggers
- [ ] Gold cannot be used for calling

### Phase 8
- [ ] All players must respond (no auto-pass)
- [ ] Priority resolution correct
- [ ] Chow only from left player
- [ ] Turn continues from caller

### Phase 9
- [ ] Scoring formula correct
- [ ] Self-draw multiplier applies
- [ ] Three Golds bonus added
- [ ] All losers pay winner
