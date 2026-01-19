# Mahjong Vibes - Multiplayer Fuzhou Mahjong (福州麻将)

A real-time multiplayer Fuzhou Mahjong game built with Next.js and Firebase.

## Features

### Implemented
- **Real-time Multiplayer**: 4-player games with Firebase Realtime Database sync
- **Room System**: Create/join rooms with 6-character codes
- **Bot Players**: Fill empty seats with AI bots from the room lobby
- **Full Game Loop**: Deal, draw, discard, call (Peng/Chi), hu
- **Calling System**: Peng (triplet), Chi (sequence), and Gang (quad) with priority resolution
- **Gang Support**: Concealed Gang, Gang from discard, and Peng upgrade with replacement draws
- **Hu Detection**: Validates winning hands (5 sets + 1 pair) with Gold tile wildcards
- **Gold Tiles**: Random suit tile becomes wildcard each round
- **Bonus Tile Exposure**: Winds and dragons exposed at start for bonus points
- **Scoring System**: Base + bonus tiles + gold tiles, with self-draw multiplier
- **Cumulative Scoring**: Track scores across multiple rounds with settlement calculator
- **Three Golds Win**: Instant win when drawing 3 Gold tiles
- **Modern UI**: Suit-colored tiles (Dots=red, Bamboo=blue, Characters=green), responsive layout

### Fuzhou Mahjong Rules (福州麻将)
- **128 tiles**: 108 suited (dots, bamboo, characters) + 16 winds + 4 red dragons
- **No flowers/seasons**: Unlike other variants
- **Gold tile**: One random suit tile type becomes wildcard each game
- **Winning hand**: 5 sets (pengs or chis) + 1 pair = 17 tiles
- **Bonus tiles**: Winds and dragons are exposed and give bonus points

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Realtime Database

### Setup

1. Clone and install:
```bash
cd app
npm install
```

2. Configure Firebase:
```bash
cp .env.local.example .env.local
# Edit .env.local with your Firebase credentials
```

3. Run development server:
```bash
npm run dev
```

4. Open http://localhost:3000

### Testing Multiplayer

For quick 4-player testing:
```bash
node scripts/setup-test-game.mjs
```

This creates a room with 4 test players. Open the provided URLs in separate browser tabs.

## Project Structure

```
app/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── page.tsx      # Home - create/join rooms
│   │   ├── create/       # Room creation
│   │   ├── room/[code]/  # Waiting room
│   │   └── game/[code]/  # Main game UI
│   ├── components/       # Reusable UI components
│   ├── hooks/            # React hooks
│   │   ├── useAuth.ts    # Firebase authentication
│   │   ├── useRoom.ts    # Room state management
│   │   ├── useGame.ts    # Game state and actions
│   │   └── useBotRunner.ts # AI bot execution for bot players
│   ├── lib/              # Core game logic
│   │   ├── game.ts       # Game actions (draw, discard, call, win)
│   │   ├── tiles.ts      # Tile utilities and win detection
│   │   └── settle.ts     # Score settlement calculator
│   ├── firebase/         # Firebase configuration
│   └── types/            # TypeScript type definitions
├── scripts/              # Development utilities
│   ├── setup-test-game.mjs   # Quick 4-player test setup
│   ├── force-win.mjs         # Force a win for testing
│   └── restart-game.mjs      # Restart game with new dealer
└── FUTURE_FEATURES.md    # Planned features
```

## Game Flow

1. **Create Room**: Host creates room, gets 6-character code
2. **Join Room**: Players join using code, select seats (East/South/West/North)
3. **Start Game**: Host starts when 4 players ready
4. **Bonus Exposure**: Players expose wind/dragon tiles (clockwise from dealer)
5. **Gold Reveal**: Random suit tile revealed as wildcard
6. **Play**: Draw, discard, call pung/chow, declare wins
7. **Scoring**: Winner scores based on hand composition
8. **Next Round**: Play additional rounds, track cumulative scores
9. **Settlement**: Calculate minimum transfers to balance scores

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Firebase Realtime Database
- **Auth**: Firebase Anonymous Authentication
- **State**: React hooks with Firebase real-time sync

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `node scripts/setup-test-game.mjs` | Create test game with 4 players |
| `node scripts/bot-game.mjs <room> [--speed=fast\|normal\|slow]` | Run full game with AI bots |
| `node scripts/bot-player.mjs <room> <seat> [--watch]` | Run AI bot for single player |
| `node scripts/force-win.mjs <room> [seat] [score]` | Force a win for testing |
| `node scripts/restart-game.mjs <room>` | Restart game with rotated dealer |

### Bot Testing

Run a complete game with AI playing all 4 seats:
```bash
# Setup a test game first
node scripts/setup-test-game.mjs
# Note the room code, then run bots
node scripts/bot-game.mjs <ROOM_CODE> --speed=fast
```

The bots use strategic decision-making:
- Evaluates hand structure (shanten calculation)
- Prioritizes safe discards (honors, terminals, already-discarded tiles)
- Calls pung/chow when it improves hand significantly
- Always declares win when possible

## Future Features

See [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) for planned features including:
- Error boundaries and loading states
- Mobile touch optimization
- Keyboard shortcuts
