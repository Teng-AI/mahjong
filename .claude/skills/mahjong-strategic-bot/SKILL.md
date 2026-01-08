# Fujian Mahjong Strategic Bot

An AI bot that plays Fujian Mahjong optimally. Use this skill when you need to make strategic decisions for a player or implement automated play.

## When to Use
- Testing game mechanics with intelligent opponents
- Simulating full games without manual play
- Analyzing optimal play in specific situations
- User asks for strategic advice on their hand

## Core Strategy Principles

### 1. Hand Evaluation (Shanten Count)
**Shanten** = minimum number of tile changes needed to reach tenpai (one tile from winning)
- 0-shanten = Tenpai (waiting for winning tile)
- 1-shanten = One useful draw away from tenpai
- Lower shanten = better hand

**Tile Usefulness Priority:**
1. Tiles that complete sets (highest)
2. Tiles that form pairs (need exactly one pair)
3. Tiles in partial sets (e.g., 4-5 waiting for 3 or 6)
4. Isolated tiles (lowest - discard candidates)

### 2. Discard Strategy

**Discard Priority (safest to riskiest):**
1. **Isolated honor tiles** (winds/dragons not matching Gold) - rarely useful to others
2. **Terminal tiles** (1s and 9s) - only form edge chows
3. **Already-discarded tile types** - confirmed safe
4. **Tiles far from your hand's focus** - if building dots, discard characters
5. **Middle tiles (4,5,6)** - most dangerous, form many chows

**Safe Tile Identification:**
- Tiles already discarded 3+ times are safe (4th copy can't win)
- Tiles matching opponent's recent discards (they likely don't need them)
- Gold tiles CANNOT be discarded - keep them always

### 3. Calling Strategy (Pung/Chow)

**When to Call:**
- Call if it gets you to tenpai
- Call if you have 2+ Gold tiles (hand is already fast)
- Call Pung over Chow (more flexible, any position)

**When NOT to Call:**
- Early game with good hand shape (keep options open)
- Calling would leave you with orphan tiles
- You're close to a high-scoring concealed hand

**Chow Considerations:**
- Only available to next-in-turn player
- Exposes your suit preference
- Consider which tiles you use (keep flexibility)

### 4. Gold Tile Strategy

**Gold tiles are wildcards - use them wisely:**
- Never discard Gold tiles
- Save Golds to complete difficult sets
- With 3 Golds, consider going for Three Golds win (draw more)
- Golds count as any tile for set completion

**Three Golds Win:**
- If you draw 3 Gold tiles, instant win with bonus
- With 2 Golds, drawing is more valuable (chance at 3rd)

### 5. Defensive Play

**Reading Danger Signs:**
- Opponent calling = they're close to winning
- Opponent with many exposed melds = very close
- Track discards to identify safe tiles

**When to Play Defensively:**
- Opponent has 3+ exposed melds (likely tenpai)
- Late game with few wall tiles remaining
- Your hand is far from winning

**Defensive Discards:**
- Match opponent's discards (confirmed safe)
- Discard from suits they've been discarding
- Avoid tiles adjacent to their called melds

### 6. Positional Awareness

**Dealer Considerations:**
- Dealer starts with 17 tiles (others have 16)
- Dealer draws first
- (Future: Dealer stays if they win)

**Turn Order for Chow:**
- Can only chow from player directly before you
- Plan chow opportunities based on position

## Decision Algorithm

### On Your Turn (After Drawing)

```
1. CHECK WIN:
   - Can I win? → Declare win (always)

2. EVALUATE HAND:
   - Calculate shanten
   - Identify complete sets, partial sets, pairs, orphans

3. SELECT DISCARD:
   - If tenpai: discard safest tile that keeps tenpai
   - If not tenpai: discard tile that most reduces shanten
   - Tie-breaker: prefer safer tiles (honors > terminals > middles)

4. NEVER DISCARD:
   - Gold tiles
   - Tiles that would increase shanten
```

### On Opponent's Discard (Calling Phase)

```
1. CHECK WIN:
   - Can I win on this discard? → Call WIN (highest priority)

2. CHECK PUNG:
   - Do I have 2 matching tiles?
   - Would calling improve my hand significantly?
   - Am I close to tenpai? → Call PUNG

3. CHECK CHOW (if next-in-turn):
   - Do I have tiles to complete a sequence?
   - Would calling get me to tenpai? → Call CHOW
   - Would calling leave orphans? → PASS

4. DEFAULT:
   - PASS (keep hand concealed)
```

## Implementation: Bot Turn Function

```javascript
async function botTurn(roomCode, seat) {
  const gameState = await getGameState(roomCode);
  const hand = await getPrivateHand(roomCode, seat);
  const goldType = gameState.goldTileType;

  // 1. Check for win
  if (canWin(hand, goldType)) {
    return declareSelfDrawWin(roomCode, seat);
  }

  // 2. Evaluate hand and choose discard
  const analysis = analyzeHand(hand, goldType, gameState.discardPile);
  const bestDiscard = selectBestDiscard(analysis);

  return discardTile(roomCode, seat, bestDiscard);
}
```

## Implementation: Bot Call Response

```javascript
async function botCallResponse(roomCode, seat, discardedTile) {
  const gameState = await getGameState(roomCode);
  const hand = await getPrivateHand(roomCode, seat);
  const goldType = gameState.goldTileType;
  const melds = gameState.exposedMelds[`seat${seat}`] || [];

  // 1. Always win if possible
  if (canWinOnDiscard(hand, discardedTile, goldType, melds.length)) {
    return submitCallResponse(roomCode, seat, 'win');
  }

  // 2. Consider pung
  if (canPung(hand, discardedTile, goldType, melds.length)) {
    const shantenBefore = calculateShanten(hand, goldType, melds.length);
    const shantenAfter = calculateShantenAfterPung(hand, discardedTile, goldType, melds.length);

    if (shantenAfter < shantenBefore || shantenAfter <= 1) {
      return submitCallResponse(roomCode, seat, 'pung');
    }
  }

  // 3. Consider chow (if next in turn)
  if (isNextInTurn(seat, gameState.lastAction.playerSeat)) {
    const chowOptions = getChowOptions(hand, discardedTile, goldType, melds.length);

    for (const option of chowOptions) {
      const shantenAfter = calculateShantenAfterChow(hand, option, goldType, melds.length);
      if (shantenAfter <= 1) {
        return submitCallResponse(roomCode, seat, 'chow', option.tilesFromHand);
      }
    }
  }

  // 4. Default: pass
  return submitCallResponse(roomCode, seat, 'pass');
}
```

## Hand Analysis Utilities

### Calculate Shanten (Simplified)

```javascript
function calculateShanten(hand, goldType, meldCount) {
  const setsNeeded = 5 - meldCount;
  const tilesNeeded = setsNeeded * 3 + 2; // sets + pair

  // Count complete sets, partial sets, pairs
  const analysis = analyzeHandStructure(hand, goldType);

  // Shanten = (sets needed - complete sets - partial sets/2)
  //           + (need pair ? 1 : 0)
  //           - gold tiles available

  return Math.max(0,
    setsNeeded - analysis.completeSets
    - Math.floor(analysis.partialSets / 2)
    + (analysis.pairs === 0 ? 1 : 0)
    - analysis.goldCount
  );
}
```

### Identify Best Discard

```javascript
function selectBestDiscard(analysis) {
  const candidates = analysis.tiles.filter(t => !isGoldTile(t));

  // Score each tile (lower = better to discard)
  const scores = candidates.map(tile => ({
    tile,
    score: calculateTileValue(tile, analysis)
  }));

  // Sort by score ascending (worst tiles first)
  scores.sort((a, b) => a.score - b.score);

  return scores[0].tile;
}

function calculateTileValue(tile, analysis) {
  let value = 0;

  // Part of complete set: very valuable
  if (analysis.completeSets.includes(tile)) value += 100;

  // Part of pair (and we need a pair): valuable
  if (analysis.pairs.includes(tile) && analysis.pairs.length <= 1) value += 50;

  // Part of partial set: somewhat valuable
  if (analysis.partialSets.includes(tile)) value += 25;

  // Adjacent to other tiles: has potential
  if (hasAdjacentTiles(tile, analysis.hand)) value += 10;

  // Honor tiles with no pair: less valuable
  if (isHonorTile(tile) && !analysis.pairs.includes(tile)) value -= 5;

  // Terminal tiles: slightly less valuable
  if (isTerminal(tile)) value -= 3;

  return value;
}
```

## Safety Considerations

**Information Boundaries:**
- Each bot only sees its own hand + public info
- No cross-player knowledge sharing
- Bots infer from discards like human players would

**Fair Play:**
- Bots follow same rules as humans
- No peeking at wall or other hands
- Decisions based only on visible information

## Usage Examples

### Run Bot for All Players
```bash
node scripts/bot-game.mjs <roomCode>
```

### Run Bot for Single Player
```bash
node scripts/bot-turn.mjs <roomCode> <seat>
```

### Get Strategic Advice
Ask Claude: "What should I discard from this hand: [tiles]?"

## Future Enhancements

- Monte Carlo simulation for discard decisions
- Opponent modeling based on discard patterns
- Risk-adjusted play (defensive vs aggressive modes)
- Learning from game history
