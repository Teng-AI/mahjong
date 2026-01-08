# Changelog

All notable changes to the Fujian Mahjong project.

---

## [Unreleased]

### Next Up
- Kong (quad) declarations
- Dealer streak bonus system

---

## 2026-01-08

### Winner Screen Redesign & Bug Fixes

#### Changed
- **Winner Screen Redesign**
  - Wide 2-column grid layout (replaces narrow centered column)
  - Left column: Winning Hand with all tiles in one row
  - Right column: Score Breakdown and Session Scores tables
  - Winning tile highlighted with amber pulse in hand display
  - Your Hand section shown for non-winners
  - Responsive: stacks to single column on mobile
- **Loading Screen**: Changed from bright green to subtle slate gradient

#### Fixed
- **Win Detection Bug**: Gold tiles now work as first tile in chows
  - Example: Gold(7) + 8萬 + 9萬 is now correctly recognized
  - Added wildcard-as-first-tile cases in recursive algorithm
- **Rules Tooltip**: Added "?" button in header with beginner-friendly rules
  - Quick overview section for basic gameplay
  - Detailed rules section for complete reference
  - Uniform text sizing with larger headers

#### Files Modified
- `app/src/app/game/[code]/page.tsx` - Winner screen redesign, loading colors, rules tooltip
- `app/src/lib/tiles.ts` - Win detection fix for wildcards
- `app/src/app/page.tsx` - Removed Status section and MVP footer text

---

## 2025-01-08

### Bot Players & UI Redesign

#### Added
- **Bot Players**: Fill empty seats with AI bots from room lobby
  - "Fill Empty Seats with AI Bots" button for host
  - Individual "+ Bot" buttons per empty seat
  - Bot indicator (🤖) in player lists
  - `useBotRunner.ts` hook for client-side bot execution
  - Bots auto-play: expose bonus, draw, discard, call pung/chow, declare wins
  - Strategic decision-making with shanten calculation
- **Gold Tile Fix**: Ensures only suited tiles (dots/bamboo/characters) become Gold
  - If bonus tile (wind/dragon) is revealed during Gold selection, dealer receives it
  - Keeps drawing until a suited tile is found
- **Improved Game Logging**: Clearer messages when bonus tiles are exposed

#### Changed
- **Modern UI Redesign**
  - New slate/gray color scheme (replaces heavy green)
  - Suit-colored tile text: Dots=red, Bamboo=blue, Characters=green
  - Larger tiles in Your Hand and Discard Pile sections
  - Reorganized layout: Your Hand (prominent) → Game Log → Other Players/Discard
  - Phase/turn banner integrated with hand section
  - Compact header with room code, Gold tile, wall count
  - Responsive two-column layout for Other Players and Discard Pile
  - Larger text throughout for better readability
- **Compact Layout Improvements**
  - 3-column middle row: Game Log | Last Discard | Discard Pile (saves vertical space)
  - Last Discard shown prominently in center with red highlight when active
  - Other players show bonus points as "+N" count instead of individual tiles
  - Subtle gold tile highlighting (pale yellow bg) so suit colors remain visible
  - Gold tiles now display suit-specific text colors (red/blue/green)

#### Files Created
- `app/src/hooks/useBotRunner.ts` - Client-side bot runner with strategic AI

#### Files Modified
- `app/src/lib/rooms.ts` - Added `addBotPlayer()`, `fillWithBots()`, `getBotSeats()`
- `app/src/lib/game.ts` - Fixed `revealGoldTile()` to ensure suited tile, improved logging
- `app/src/types/index.ts` - Added `isBot` flag to `RoomPlayer`
- `app/src/app/room/[code]/page.tsx` - Bot player UI in room lobby
- `app/src/app/game/[code]/page.tsx` - Complete UI redesign

---

## 2025-01-07 (Phase 6+7)

### Phase 6+7: Win Detection with Gold Wildcards - COMPLETE

#### Added
- **Win detection algorithm** with recursive backtracking
  - `canFormWinningHand()` - checks if 17 tiles form 5 sets + 1 pair
  - `tryFormSetsAndPair()` - recursive set formation with wildcard support
  - `canFormPair()` - pair validation with wildcards
  - `getWinningTiles()` - tenpai detection (finds all winning tiles)
- **Gold tile wildcard support**
  - Gold tiles can substitute for any suit tile in sets and pairs
  - Proper counting of wildcards in recursive algorithm
  - Chow completion with 1 or 2 wildcards
  - Pung completion with wildcards
- **Win declaration functions**
  - `canWin()` - check if player can declare win
  - `declareSelfDrawWin()` - handle self-draw win with scoring
  - `canWinOnDiscard()` - check if can win on discarded tile
  - `declareDiscardWin()` - handle discard win with scoring
- **Win button UI**
  - Pulsing golden "WIN!" button when player can win
  - Self-draw win button (appears after drawing winning tile)
  - Discard win button (appears when another player discards your winning tile)
- **Enhanced winner screen**
  - Shows win type (self-draw, discard, Three Golds)
  - Displays winning tile for discard wins
  - Shows who discarded the winning tile
  - Complete score breakdown

#### Files Created/Modified
- `app/src/lib/tiles.ts` - Win detection algorithm
- `app/src/lib/game.ts` - Win declaration functions
- `app/src/hooks/useGame.ts` - Win state and handlers
- `app/src/app/game/[code]/page.tsx` - Win button UI and enhanced winner screen
- `app/src/types/index.ts` - Added winningTile, discarderSeat to WinnerInfo

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
