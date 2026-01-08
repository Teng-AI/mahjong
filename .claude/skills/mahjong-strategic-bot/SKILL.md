# Fujian Mahjong Strategic Bot

An AI bot that plays Fujian Mahjong to **maximize expected points over a series of games**, not just to win individual hands.

## When to Use
- Testing game mechanics with intelligent opponents
- Simulating full games without manual play
- Analyzing optimal play in specific situations
- User asks for strategic advice on their hand

## Core Philosophy

**Goal: Maximize expected value (EV) over many games**

This means:
- A 4-point win is worth more than a 1-point win
- Self-draw (2x multiplier) is often worth waiting for
- Don't push weak hands when opponents look dangerous
- Sometimes folding (playing defensively) is correct
- Avoid dealing into opponents' big hands

## Core Strategy Principles

### 1. Hand Value Assessment

**Scoring Components:**
- Base: 1 point
- Each Gold tile in hand: +1 point
- Each bonus tile exposed: +1 point
- Self-draw multiplier: ×2
- (Future) Three Golds: instant win + bonus

**Expected Value Calculation:**
```
EV = (Win probability) × (Expected score) - (Deal-in probability) × (Expected loss)
```

A hand with 2 Gold tiles (base 1 + 2 golds = 3 points) with self-draw = 6 points
vs. calling to win faster but losing self-draw chance = 3 points

**Hand Quality Tiers:**
- **Premium (4+ points)**: Push aggressively, worth taking risks
- **Good (2-3 points)**: Play normally, call if it speeds up significantly
- **Weak (1 point)**: Only win if safe, consider folding if others are close

### 2. Hand Evaluation (Shanten Count)
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

**The Self-Draw Dilemma:**
Calling speeds up your hand BUT sacrifices the 2x self-draw multiplier.

| Scenario | Self-Draw Value | Call Value | Decision |
|----------|-----------------|------------|----------|
| 1 Gold, close to tenpai | 1×2 = 2 pts | 1 pt | Don't call |
| 2 Golds, far from tenpai | 3×2 = 6 pts | 3 pts | Only call if desperate |
| 0 Golds, opponent dangerous | 1×2 = 2 pts | 1 pt | Call to end game fast |
| 3+ Golds | 4×2 = 8 pts | 4 pts | Never call, push for self-draw |

**When to Call:**
- Hand has LOW value (0-1 Gold) AND opponent looks close to winning
- Call gets you to tenpai AND you're unlikely to self-draw anyway
- Late game with few wall tiles (self-draw chance low)
- Call Pung over Chow (more flexible, any position)

**When NOT to Call:**
- Hand has HIGH value (2+ Golds) - protect self-draw bonus
- Early game with good hand shape (keep options open)
- Calling would leave you with orphan tiles
- You're already close to tenpai (self-draw is likely)

**Chow Considerations:**
- Only available to next-in-turn player
- Exposes your suit preference (dangerous)
- Loses self-draw potential
- Usually only worth it to end game vs dangerous opponent

### 4. Gold Tile Strategy

**Gold tiles are wildcards - use them wisely:**
- Never discard Gold tiles
- Save Golds to complete difficult sets
- With 3 Golds, consider going for Three Golds win (draw more)
- Golds count as any tile for set completion

**Three Golds Win:**
- If you draw 3 Gold tiles, instant win with bonus
- With 2 Golds, drawing is more valuable (chance at 3rd)

### 5. Defensive Play (Folding)

**When to Fold (Play Pure Defense):**
The key insight: **avoiding a 4-point loss is worth more than chasing a 1-point win**

| Your Hand | Opponent Danger | Action |
|-----------|-----------------|--------|
| Weak (1pt), far from tenpai | 3+ melds exposed | FOLD - discard safe tiles only |
| Weak (1pt), close to tenpai | 2 melds exposed | Push carefully |
| Strong (3+pts), any distance | Any | Push - your EV is positive |

**Danger Assessment:**
- **Low danger**: 0-1 exposed melds, early game
- **Medium danger**: 2 exposed melds OR late game (wall < 30)
- **High danger**: 3+ exposed melds, late game, opponent discarding safe

**Reading Danger Signs:**
- Opponent calling = they're close to winning
- Opponent with many exposed melds = very close
- Opponent suddenly discarding safe tiles = they're tenpai
- Track discards to identify safe tiles

**Defensive Discards (when folding):**
- **Safest**: Tiles discarded 3+ times (4th copy can't win)
- **Safe**: Match opponent's recent discards
- **Okay**: Honor tiles they've discarded
- **Risky**: Middle tiles (4,5,6) in suits they're collecting
- **Dangerous**: Tiles adjacent to their called melds

### 6. Positional Awareness

**Dealer Considerations:**
- Dealer starts with 17 tiles (others have 16)
- Dealer draws first
- (Future: Dealer stays if they win)

**Turn Order for Chow:**
- Can only chow from player directly before you
- Plan chow opportunities based on position

## Decision Algorithm (EV-Based)

### On Your Turn (After Drawing)

```
1. CHECK WIN:
   - Can I win? → Declare win (always take guaranteed points)

2. ASSESS SITUATION:
   - Calculate hand value (base + golds + bonuses)
   - Calculate shanten (distance to tenpai)
   - Assess opponent danger level
   - Check wall tiles remaining

3. DECIDE MODE:
   - If hand value >= 3 AND shanten <= 2 → PUSH (aggressive)
   - If opponent danger HIGH AND hand value <= 1 → FOLD (defensive)
   - Otherwise → BALANCED (normal play)

4. SELECT DISCARD:
   PUSH mode:
     - Prioritize tiles that reduce shanten
     - Accept moderate risk on discards

   FOLD mode:
     - Prioritize SAFE tiles (already discarded 3x, match opponent discards)
     - Ignore shanten improvement

   BALANCED mode:
     - Reduce shanten while preferring safer options
     - Tie-breaker: honors > terminals > middles

5. NEVER DISCARD:
   - Gold tiles (ever)
   - Your only pair (usually)
```

### On Opponent's Discard (Calling Phase)

```
1. CHECK WIN:
   - Can I win on this discard? → Call WIN (always take points)

2. CALCULATE CALL EV:
   Hand value with self-draw = (base + golds) × 2
   Hand value with call = (base + golds) × 1

   Call loses: self-draw potential, hand concealment, flexibility

3. SHOULD I CALL PUNG/CHOW?

   CALL if ALL of:
   - Hand has LOW value (0-1 Gold)
   - Opponent looks DANGEROUS (2+ melds)
   - Call gets me significantly closer to tenpai

   DON'T CALL if ANY of:
   - Hand has 2+ Golds (protect self-draw bonus)
   - I'm already close to tenpai (will likely self-draw)
   - Early game, wall > 60 tiles (plenty of time)

4. DEFAULT:
   - PASS (protect self-draw potential)
```

### EV Comparison Example

**Situation**: You have 2 Gold tiles, someone discards a tile you can pung.

| Option | Calculation | EV |
|--------|-------------|-----|
| Call Pung, win on discard | 3 pts × 80% win chance | 2.4 pts |
| Don't call, try self-draw | 6 pts × 40% win chance | 2.4 pts |
| Don't call, risk deal-in | -3 pts × 20% deal-in | -0.6 pts |

In this case: **Don't call** - same EV for winning, but calling removes self-draw upside.

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
