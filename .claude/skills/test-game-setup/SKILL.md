# Test Game Setup

Setup a fresh 4-player mahjong game for testing. Clears any existing test games and creates a new room with all 4 players ready to play.

## When to Use
- Testing the mahjong game
- User says "start a test game", "set up a game for testing", or "new test room"
- Need to test multiplayer functionality with all 4 seats

## Instructions

### Step 1: Create Room and Add Players

Run the setup script from the app directory:

```bash
cd app && node scripts/setup-test-game.mjs
```

This script will:
1. Create a new room with a random 6-character code
2. Add 4 test players (Player1-East, Player2-South, Player3-West, Player4-North)
3. Initialize the game state
4. Output the room code and game URLs

### Step 2: Open Browser Tabs

After the script runs, open 4 browser tabs with seat overrides:

- **East (Dealer)**: `http://localhost:3000/game/{ROOM_CODE}?seat=0`
- **South**: `http://localhost:3000/game/{ROOM_CODE}?seat=1`
- **West**: `http://localhost:3000/game/{ROOM_CODE}?seat=2`
- **North**: `http://localhost:3000/game/{ROOM_CODE}?seat=3`

### Step 3: Play the Game

Each tab controls one player. Switch between tabs to:
- Expose bonus tiles (in order: East → South → West → North)
- Draw and discard tiles
- Call Pung/Chow on discards
- Declare wins

## Notes

- The dev server must be running (`npm run dev`)
- Each tab shows that player's hand and perspective
- Gold tile is revealed after bonus exposure phase
- All 4 players must complete bonus exposure before normal play begins
