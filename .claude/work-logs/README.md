# Work Session Logs

This directory contains detailed documentation of work sessions for the Fujian Mahjong project.

## Purpose

These logs capture:
- What was accomplished in each session
- Key decisions and their rationale
- Problems encountered and solutions
- Code changes and file modifications
- Next steps and blockers

## Structure

```
work-logs/
├── README.md (this file)
├── 2026-01/
│   └── 2026-01-06_session-01.md
└── YYYY-MM/
    └── YYYY-MM-DD_session-NN.md
```

Sessions are organized by year-month, with individual session files named by date and session number.

## Recent Sessions

### 2026-01-16

- **[Session 01](2026-01/2026-01-16_session-01.md)** - Turn Timer Implementation & Scoring Rebalance
  - Added turn timer to room lobby (side-by-side with calling timer)
  - Auto-play on timer expiration (auto-draw, auto-discard, auto-win detection)
  - Fixed type error in game.ts (exposed melds path access)
  - Comprehensive special bonus scoring rebalance: No Bonus/Kong +15, Three Golds +30, Robbing Gold +30, Golden Pair +50, All One Suit +100
  - Updated scoring in game.ts (4 locations), rules modal, and documentation
  - Reordered bonus table by point value (ascending)
  - Merged feature/calling-phase-timer branch into main (zero conflicts)
  - All 123 tests pass, build succeeds

### 2026-01-12

- **[Session 01](2026-01/2026-01-12_session-01.md)** - Turn Indicator & Layout Improvements
  - Created TurnIndicator component with N/E/S/W compass positions
  - Green box highlights current actor, grey box shows previous discarder
  - Player always positioned at South (relative positioning)
  - Reorganized desktop layout: Turn Indicator + context on left, Discard Pile on right
  - Moved Game Log to bottom of page for better information hierarchy
  - Fixed turn indicator logic to update correctly during playing and calling phases
  - Added "Waiting for..." placeholder in action buttons area
  - Fixed layout shifts by setting min-height on action buttons container

### 2026-01-11

- **[Session 01](2026-01/2026-01-11_session-01.md)** - Test Coverage Expansion & Project Documentation
  - Expanded test coverage from 58 to 123 tests (+112%)
  - Created comprehensive project-level CLAUDE.md for AI context
  - Added 22 tests for settlement calculator (settle.ts)
  - Added 43 tests for game utility functions (game.ts)
  - Set up GitHub Actions CI workflow (lint, test, build on PR)
  - Updated 3 project-specific skills with current feature state
  - Cleaned up documentation (README, CHANGELOG, FUTURE_FEATURES)
  - Deleted stale feature/calling-timer branch

### 2026-01-10

- **[Session 01](2026-01/2026-01-10_session-01.md)** - Firebase Update Gotchas Documentation
  - Documented critical Firebase update() vs. set() behavior
  - Explained nested object merging issues
  - Added fix patterns and best practices

### 2026-01-09

- **[Session 01](2026-01/2026-01-09_session-01.md)** - Mobile UX Improvements
  - Fixed action button ordering and pass button visibility
  - Improved mobile responsiveness and touch targets

### 2026-01-08

- **[Session 03](2026-01/2026-01-08_session-03.md)** - UI Polish, Critical Win Detection Bug Fix, and Rules Documentation
  - **CRITICAL FIX**: Win detection now correctly handles Gold tile as first tile in chows (e.g., Gold(7) + 8萬 + 9萬)
  - Added beginner-friendly rules tooltip with basic and detailed rules sections
  - Updated loading screen to match game theme (slate instead of green)
  - Documented future features: Winner screen redesign and adjustable bot difficulty
  - All text and tile sizes increased for better readability

- **[Session 02](2026-01/2026-01-08_session-02.md)** - UI Polish & Layout Improvements
  - 3-column middle row layout (Game Log | Last Discard | Discard Pile)
  - Refined gold tile highlighting with subtle pale yellow background
  - Simplified bonus display to "+N" count for other players
  - Increased text and tile sizes throughout for better readability
  - **MVP Status: COMPLETE** - All Phase 1-8 features implemented

- **[Session 01](2026-01/2026-01-08_session-01.md)** - Cumulative Scoring & Win Detection Bug Fixes
  - Implemented cumulative scoring system across rounds
  - Added settlement calculator with minimum transfer algorithm
  - Fixed win detection tile sorting algorithm
  - Fixed duplicate UI elements and tile count display bugs
  - Created test scripts for multi-round gameplay

### 2026-01-07

- **[Session 01](2026-01/2026-01-07_session-01.md)** - Bot Players & UI Redesign
  - Added bot player system with strategic AI
  - Complete UI redesign with modern color scheme
  - Fixed Gold tile selection to ensure suited tiles
  - Implemented comprehensive game logging

### 2026-01-06

- **[Session 01](2026-01/2026-01-06_session-01.md)** - Phase 2: Room System Implementation
  - Created room management utilities and React hooks
  - Built Create Room, Join Room, and Lobby pages
  - Implemented real-time Firebase synchronization
  - Added dealer selection and kick player functionality
  - Fixed auto-join bug

## Project Phases

The Fujian Mahjong project follows this development roadmap:

**MVP - COMPLETE ✅**

- ✅ **Phase 1**: Firebase Setup & Authentication
- ✅ **Phase 2**: Room System (Create, Join, Lobby)
- ✅ **Phase 3**: Game Setup & Dealing
- ✅ **Phase 4**: Bonus Tile System
- ✅ **Phase 5**: Turn Loop (Draw, Discard, Turns)
- ✅ **Phase 6**: Calling System (Win, Pung, Chow)
- ✅ **Phase 7**: Win Detection with Gold Wildcards
- ✅ **Phase 8**: Cumulative Scoring & Settlement

**Post-MVP Enhancements**

- ✅ **Kong** (Quad) Declarations - Complete
- ✅ **Dealer Streak** Bonus System - Complete
- ✅ **Polish & Deployment** (animations, sounds, mobile optimization) - Complete
- ✅ **Test Coverage** - 123 tests across core game logic
- ✅ **CI/CD Pipeline** - GitHub Actions workflow

## Finding Information

Each session log includes:
- **Overview**: High-level summary of accomplishments
- **Goals & Objectives**: What was planned vs. completed
- **What Was Accomplished**: Detailed breakdown by feature/component
- **Files Changed**: Created, modified, and deleted files
- **Key Decisions Made**: Important architectural and design choices
- **Problems Solved**: Bugs fixed and challenges overcome
- **Next Steps**: Immediate, short-term, and long-term tasks

Use the table of contents in each session file to jump to specific sections.

## Contributing

When documenting a new session:
1. Create file: `YYYY-MM/YYYY-MM-DD_session-NN.md`
2. Use the standard template structure
3. Be comprehensive but concise
4. Focus on "why" decisions were made, not just "what" was done
5. Update this README with a link to the new session

---

**Last updated**: 2026-01-16
**MVP Status**: ✅ Complete - Fully playable game with all core features
**Current Focus**: Timer features complete, scoring balanced, ready for production deployment
