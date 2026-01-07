# Changelog

All notable changes to the Fujian Mahjong project.

---

## [Unreleased]

### Next Up
- Phase 6: Win Detection (basic winning hand algorithm)

---

## 2025-01-07 (cont.)

### Tile System Update

#### Changed
- **Replaced season tiles (春夏秋冬) with red dragon tiles (中)**
  - Red dragon tiles function identically to season tiles as bonus tiles
  - 4 copies of 中 instead of 4 unique season tiles
  - Same bonus point value and behavior
  - Simplifies tile set while maintaining gameplay

#### Files Modified
- `app/src/lib/tiles.ts` - Updated tile generation, parsing, and display
- `app/src/types/index.ts` - Changed TileCategory from 'season' to 'dragon'

### UI Improvements

#### Changed
- **Consolidated discard pile display**
  - Groups identical tiles together with count badges
  - Shows total tile count in header
  - Highlights most recently discarded tile type with red ring
  - Cleaner, more compact display

#### Files Modified
- `app/src/app/game/[code]/page.tsx` - New discard pile rendering logic

---

## 2025-01-07

### Phase 5: Turn Loop - COMPLETE

#### Added
- `needsToDraw()` function to determine if current player needs to draw
- `drawTile()` function with:
  - Tile drawing from wall
  - Bonus tile auto-exposure with replacement chains
  - Three Golds instant win check after draw
  - Auto-sort hand after draw
- `discardTile()` function with:
  - Remove tile from hand
  - Add to discard pile
  - Advance turn to next player
- `handleDrawGame()` for wall exhaustion
- Updated `useGame` hook with `shouldDraw`, `handleDraw`, `handleDiscard`
- Game page UI updates:
  - "Draw Tile" button when it's time to draw
  - Tile selection for discard (click to select, click again to deselect)
  - "Discard Selected Tile" button
  - Last action indicator showing who discarded what
  - Turn instructions in phase indicator
  - Draw game end screen for wall exhaustion

#### Files Modified
- `app/src/lib/game.ts` - Added turn loop functions
- `app/src/hooks/useGame.ts` - Added draw/discard methods
- `app/src/app/game/[code]/page.tsx` - Turn action UI

#### Tested
- Dealer's first turn (skip draw, discard only)
- Normal turn flow (draw → discard)
- Turn advancement (counter-clockwise)
- Discard pile updates
- Last action indicator
- Wall count decrements

---

### Phase 4: Bonus Tile System - COMPLETE

#### Added
- Turn-based bonus tile exposure (dealer first, counter-clockwise)
- Replacement draws from wall for exposed bonus tiles
- Gold tile reveal after all bonus exposure complete
- Auto-sort hands after Gold reveal (Gold tiles sorted first, highlighted yellow)
- Three Golds instant win check after Gold reveal
- Three Golds scoring: base + bonus + golds (×2 self-draw) + 20 bonus

#### Files Created/Modified
- `app/src/lib/game.ts` - Core game logic
  - `initializeGame()` - Shuffle, deal, create game state
  - `exposeBonusTiles()` - Process bonus exposure with replacements
  - `advanceBonusExposure()` - Turn advancement
  - `revealGoldTile()` - Gold flip and Three Golds check
  - `sortAllHands()` - Sort with Gold tiles first
  - `handleThreeGoldsWin()` - Instant win handler
- `app/src/hooks/useGame.ts` - Game state subscription hook
- `app/src/app/game/[code]/page.tsx` - Game UI
  - Tile component with Gold highlighting
  - Hand display
  - Player info panels
  - Bonus exposure phase UI
  - Winner screen with score breakdown

#### Bug Fixes
- Fixed undefined Firebase data with optional chaining for `bonusTiles` and `exposedMelds`
- Fixed `gameState.wall` undefined error with fallback to empty array

#### Tested
- 4-player bonus exposure flow (using test mode)
- Replacement chains from wall
- Gold tile reveal and display
- Hand sorting after Gold reveal

---

## 2025-01-06 (Previous Session)

### Phase 3: Game Setup - COMPLETE

#### Added
- Game initialization with 128-tile shuffle
- Deal 16 tiles to each player (17 to dealer)
- Integration with room "Start Game" button
- Navigation from room lobby to game page

### Test Mode - Added

#### Added
- `?testUser=N` query parameter support in `useAuth.ts`
- Allows simulating multiple players in same browser for testing
- Test user IDs: `test-user-1`, `test-user-2`, etc.

---

## 2025-01-05 (Previous Session)

### Phase 2: Multiplayer Infrastructure - COMPLETE

#### Added
- Firebase Realtime Database integration
- Room creation with 6-character codes
- Room joining and player slots (4 seats)
- Host controls (dealer selection, kick players, start game)
- Real-time room state updates
- Player connection status tracking
- Auto-join from join page with stored player name

#### Files Created
- `app/src/firebase/config.ts` - Firebase configuration
- `app/src/lib/rooms.ts` - Room management functions
- `app/src/hooks/useRoom.ts` - Room state subscription
- `app/src/app/room/[code]/page.tsx` - Room lobby UI
- `app/src/app/create/page.tsx` - Room creation page
- `app/src/app/join/page.tsx` - Room join page

---

## 2025-01-04 (Previous Session)

### Phase 1: Core Data Structures - COMPLETE

#### Added
- Type definitions in `app/src/types/index.ts`
  - Tile types (TileId, TileType, TileSuit)
  - Player types (SeatIndex, RoomPlayer, PrivateHand)
  - Game state types (GameState, GamePhase, Meld)
  - Room types (Room, RoomStatus, RoomSettings)
  - Scoring types (WinInfo, ScoreBreakdown)
- Tile utilities in `app/src/lib/tiles.ts`
  - `generateAllTiles()` - Create 128 tile deck
  - `shuffle()` - Fisher-Yates shuffle
  - `isBonusTile()` - Check for wind/season
  - `getTileType()` - Extract type from tile ID
  - `sortTilesForDisplay()` - Sort hand with Gold priority

---

## Project Setup

### Initial Setup
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Firebase Realtime Database
- Vercel-ready deployment
