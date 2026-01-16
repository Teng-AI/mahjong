# Changelog

All notable changes to Mahjong Vibes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Calling phase timer** for time-limited calling decisions
  - Configurable 10-120 seconds or no limit
  - Auto-pass when timer expires
  - Visual countdown with warning state (red when <5s)
  - Room setting configured by host in lobby
- **Turn timer** for time-limited player turns
  - Configurable 10-120 seconds or no limit
  - Auto-draw and auto-discard when timer expires
  - Auto-win detection if player has winning hand after forced draw
  - Visual countdown with warning state
  - Room setting side-by-side with calling timer in lobby
- **Full keyboard controls** for gameplay actions
  - Customizable shortcuts for Draw, Win, Kong, Pung, Chow, Pass
  - Arrow keys navigate tile selection during discard phase
  - Number keys (1-9, 0) for quick tile selection
  - Enter to confirm, Escape to cancel
- **Kong keyboard selection** with unified button
  - Single KONG button for all kong types (concealed & pung upgrade)
  - Arrow keys navigate between multiple kong options
  - Visual highlighting groups all 4 tiles when focused
  - Enter to confirm selection
- **Chow keyboard selection** for choosing which tiles to use
  - Arrow keys navigate valid tiles, Space to select, Enter to confirm
  - Green highlight for selected tiles, yellow for focused
- Kong selection shortcuts documented in Settings modal

### Changed
- Consolidated all kong buttons into single unified KONG button
- Settings modal now scrollable with max-height constraint

### Fixed
- Arrow keys now work correctly in kong selection mode (was blocked by tile selection)
- Space bar no longer confirms kong (only Enter does)
- **Mobile chow/kong UX restored** - keyboard focus indicators (yellow ring, tile lift) hidden on touch devices
- **Tile click precision** - lifted tiles now have proper z-index for correct click targeting
- **Visual glitch in chow mode** - tile containers now have overflow-visible to prevent clipping artifacts
- **Chow deselection logic** - clicking a selected tile now properly deselects it (was resetting to wrong tile)
- **Scoring: special bonuses now trigger ×2 multiplier** even on discard wins (Golden Pair, No Bonus/Kong, All One Suit)

### Changed
- **Comprehensive rules modal rewrite** with all game rules, scoring examples, and special bonuses
- Rules modal color scheme simplified (amber headers, emerald points, slate body text)
- Added All One Suit (+60), Robbing the Gold (+20) to rules modal

### Added
- **Turn Indicator** - Round table view showing N/E/S/W positions with player always at South
  - Green box highlights current actor (whose turn it is)
  - Grey box shows previous discarder (who acted before)
  - Updates correctly during both playing and calling phases
- **Dead wall** - 16 tiles reserved at game start per Fujian Mahjong rules (wall count shows drawable tiles only)
- **Bonus tile count** - shows +X badge next to your bonus tiles
- **Fixed bottom action bar for mobile** - thumb-friendly actions at screen bottom
  - Context-aware: shows Draw/Discard during play, calling buttons during calling phase
  - WIN button larger and more prominent when available
  - Calling status flips with action buttons (see status after making choice)
- "Previous Action" box showing what happened before discard (draw, pung, chow, kong)
- Previous Action and Discarded sections side-by-side on mobile

### Changed
- Desktop layout reorganized: Turn Indicator + Previous Action + Last Discard on left, Discard Pile on right
- Game Log moved to bottom of page (below player call statuses) on desktop
- Action buttons area now has fixed height to prevent layout shifts
- Redesigned room lobby player cards with consistent heights and better spacing
- Removed seat labels (East/South/West/North) from UI for cleaner look
- Kong melds now display as single tile with ×4 badge (saves space on mobile)
- Other players' bonus count moved to info line above melds
- Mobile action buttons now full-width with even distribution
- Reorganized game layout: calling status moved to bottom, middle row reordered (Last Discard → Discard Pile → Game Log)
- PASS button changed to emerald green for better visibility
- Mobile header made smaller (reduced padding and text sizes)
- Mobile game log moved to bottom of page
- Settings button moved to far left of header
- Bot delay now waits for human to respond before starting (better UX during calling)

### Fixed
- Win sound loop now respects sound enabled setting on mobile
- Page now scrolls to top when starting new round (was stuck at bottom)
- Mobile game log auto-scrolls to show recent actions
- Tile text overflow on mobile (character tiles like 萬 now fit properly)
- Melds wrap to next line when overflowing horizontally
- Bot delay no longer stacks (single delay after human responds, then bots respond quickly)

### Added
- Kong (Quad) support with three declaration types:
  - Concealed Kong: 4 identical tiles in hand
  - Kong from discard: 3 in hand + opponent's discard
  - Pung upgrade: exposed pung + 4th tile from hand
- Kong scoring bonuses (+2 concealed, +1 exposed)
- Multiple pung upgrade selection when several options available
- Kong available anytime during turn before discarding
- Copy room code button in lobby
- Auth state feedback on homepage (loading spinner, error message)
- Test coverage expanded to 123 tests (tiles, settle, game utilities)
- Conditional debug logging (development only)
- GitHub Actions CI workflow (test, lint, build on every PR)
- Project-level CLAUDE.md for AI context

### Changed
- Branding updated to "Mahjong Vibes" throughout

### Fixed
- Console.log statements no longer appear in production
- Lint issues reduced from 46 to 6 (removed unused code, fixed type errors)

## [1.0.0] - 2026-01-09

### Added
- Multiplayer Fujian Mahjong (Gold Rush Mahjong) gameplay
- Real-time game state sync with Firebase
- Bot AI with 3 difficulty levels (easy, medium, hard)
- Room creation and joining with 6-character codes
- Pung and Chow calling system
- Win detection with Gold tile wildcards
- Golden Pair bonus scoring (+30 points)
- Three Golds instant win condition
- Dealer streak tracking and bonus
- Sound effects for game actions
- Winner screen with score breakdown
- Mobile-responsive design
- SEO metadata and Open Graph tags
- Firebase security rules
- Vercel deployment with auto-deploy

### Technical
- Next.js 16 with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Firebase Realtime Database for game state
- Firebase Anonymous Auth for players
