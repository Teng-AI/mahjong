# Mahjong Vibes - Project Context

## Project Overview

**Mahjong Vibes** is a real-time multiplayer Fuzhou Mahjong (福州麻将) game.

- **Status**: MVP Complete + Post-MVP Features
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Firebase Realtime Database
- **Deployment**: Vercel (auto-deploy from main)

## Current Feature State

### Implemented (Complete)
- 4-player real-time multiplayer with Firebase sync
- Room system (create/join with 6-char codes)
- Bot players with 3 difficulty levels (easy/medium/hard)
- Full calling system: Pung, Chow, Kong (all types)
- Kong support: Concealed Kong, Kong from discard, Pung upgrade
- Win detection with Gold tile wildcards
- Three Golds instant win
- Golden Pair bonus (+30 points)
- All One Suit bonus (+60 points)
- Dealer streak tracking
- Cumulative scoring across rounds
- Settlement calculator
- Dead wall (16 tiles)
- Sound effects and winner celebrations
- Mobile-responsive UI with fixed bottom action bar

### Not Yet Implemented
See `app/FUTURE_FEATURES.md` for full roadmap. Key items:
- Calling phase timer (attempted, reverted due to Firebase sync issues)
- Error boundaries
- Reconnection handling
- Tutorial/onboarding

## Key Files

| Path | Purpose |
|------|---------|
| `app/src/lib/tiles.ts` | Tile utilities, win detection, calling validation |
| `app/src/lib/game.ts` | Game actions (draw, discard, call, win, kong) |
| `app/src/lib/settle.ts` | Score settlement calculator |
| `app/src/hooks/useGame.ts` | Game state management and Firebase sync |
| `app/src/types/index.ts` | All TypeScript type definitions |
| `mahjong-rules.md` | Complete game rules reference |

## Testing

```bash
cd app
npm test              # Run all tests
npm run test:watch    # Watch mode
```

Current coverage: 123 tests across `tiles.ts`, `settle.ts`, `game.ts`. Gaps in hooks.

## Development Workflow

See global `~/.claude/CLAUDE.md` for standard workflow (session start, pre-implement, docs-sync, etc.)

**Project-specific notes:**
- Check `app/FUTURE_FEATURES.md` for priorities
- Review work logs in `.claude/work-logs/`

## Firebase Gotchas

**Critical**: Firebase `update()` merges nested objects, it does NOT replace them.
- `null` values are NOT stored - they delete the field
- Use `set()` for atomic replacement of nested objects
- See work log `2026-01-10_session-01.md` for detailed explanation

## Code Patterns

### Game State Updates
Always use the helper functions in `lib/game.ts`:
```typescript
await discardTile(roomCode, seatIndex, tileId);
await submitCallResponse(roomCode, seatIndex, response);
```

### Type Safety
All game types are in `src/types/index.ts`. Key types:
- `GameState` - central game object
- `PlayerState` - per-player concealed/exposed tiles
- `Meld` - exposed meld (pung/chow/kong)
- `TileId` vs `TileType` - instance vs type

## Bot Testing

```bash
node scripts/setup-test-game.mjs           # Create 4-player room
node scripts/bot-game.mjs <ROOM> --speed=fast  # Run full AI game
```

## Skills Available

Project-specific skills in `.claude/skills/`:
- `fujian-mahjong-validator` - Validate game logic
- `game-state-debugger` - Debug state issues
- `mahjong-code-reviewer` - Review code against rules
- `mahjong-test-generator` - Generate test cases
- `firebase-realtime-patterns` - Firebase patterns
- `mahjong-ui-components` - UI component patterns
