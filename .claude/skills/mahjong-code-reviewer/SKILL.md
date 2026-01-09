---
name: mahjong-code-reviewer
description: Review Fujian Mahjong game code against rules and implementation plan. Use when reviewing PRs, checking game logic, verifying scoring calculations, or ensuring MVP scope compliance.
---

# Mahjong Code Reviewer

Reviews game code against Fujian Mahjong rules and the implementation plan.

## When to Use

- Review pull requests for game logic
- Verify implementation matches rules
- Check scoring calculations
- Ensure MVP scope is followed (no out-of-scope features)
- Catch rule violations in code
- Validate state management logic

## Reference Documents

Always check code against these files:
- `mahjong-fujian-rules.md` — Authoritative game rules
- `implementation-plan.md` — MVP scope and technical plan
- `future-features.md` — Features NOT in MVP (should not be implemented)

## Review Checklist

### 1. MVP Scope Compliance

**Should NOT be in codebase:**
- [ ] No Kong implementation (no Kong types, no Kong scoring)
- [ ] No Golden Pair bonus (+30)
- [ ] No "No Bonus/Kong" bonus (+10)
- [ ] No multi-hand game structure
- [ ] No Robbing the Gold
- [ ] No dealer rotation logic (single hand mode)

**If found, flag as out-of-scope:**
```javascript
// ❌ OUT OF SCOPE
if (hand.kongs.length > 0) {
  score += hand.kongs.filter(k => k.concealed).length * 2;
  score += hand.kongs.filter(k => !k.concealed).length * 1;
}

// ❌ OUT OF SCOPE
if (isGoldenPair(hand)) {
  score += 30;
}
```

### 2. Tile System

**Correct tile counts:**
- [ ] 108 suit tiles (dots, bamboo, characters 1-9, 4 copies each)
- [ ] 20 bonus tiles (16 winds, 4 red dragons)
- [ ] Total: 128 tiles

**Tile ID format:**
```javascript
// ✅ CORRECT
'dots_1', 'dots_9', 'bamboo_5', 'characters_3'
'wind_east', 'wind_south', 'wind_west', 'wind_north'
'dragon_red' (4 copies)

// ❌ INCORRECT
'dot_1', 'Dots_1', 'DOTS_1', '1_dots'
'east', 'wind-east', 'windEast'
```

**Gold tile:**
- [ ] Only suit tiles can be Gold (not bonus tiles)
- [ ] Flipped tile removed from play (only 3 remain)
- [ ] Gold type stored in game state

### 3. Hand Management

**Tile counts:**
```javascript
// ✅ CORRECT
// During play: 16 tiles
player.concealedTiles.length + player.exposedMelds.length * 3 === 16

// After draw (before discard/win): 17 tiles
player.concealedTiles.length + player.exposedMelds.length * 3 === 17
```

**Exposed melds (MVP):**
- [ ] Only Chow and Pung (no Kong)
- [ ] Each meld has exactly 3 tiles
- [ ] Melds are visible to all players

### 4. Win Detection

**Standard win:**
- [ ] 5 sets + 1 pair = 17 tiles
- [ ] Sets are Chow (3 sequential) or Pung (3 identical)
- [ ] Gold can substitute for any tile

**Three Golds:**
- [ ] Checked after EVERY draw (normal, replacement, bonus)
- [ ] Instant and automatic (cannot decline)
- [ ] Triggers with exactly 3 Gold tiles

```javascript
// ✅ CORRECT - Check Three Golds first
function checkWin(hand, goldTileType) {
  if (hasThreeGolds(hand, goldTileType)) {
    return { win: true, type: 'three_golds', instant: true };
  }
  // Then check standard win...
}

// ❌ INCORRECT - Missing Three Golds check
function checkWin(hand, goldTileType) {
  return isValidWinningHand(hand);  // Forgot Three Golds!
}
```

**Gold substitution:**
- [ ] Gold can fill any position in Chow
- [ ] Gold can fill any position in Pung
- [ ] Gold can be part of pair
- [ ] Multiple Golds can be used

### 5. Calling System

**Priority order:**
```javascript
// ✅ CORRECT
const PRIORITY = { win: 3, pung: 2, chow: 1, pass: 0 };

// ❌ INCORRECT
const PRIORITY = { win: 3, kong: 2, pung: 1, chow: 0 };  // Kong not in MVP!
```

**Chow restriction:**
- [ ] Only from player to your LEFT
- [ ] LEFT = previous player in turn order
- [ ] Turn order is counter-clockwise

```javascript
// ✅ CORRECT
const canChow = (discarderIndex + 1) % 4 === playerIndex;

// ❌ INCORRECT
const canChow = (playerIndex + 1) % 4 === discarderIndex;  // Wrong direction!
```

**Gold restriction:**
- [ ] Gold CANNOT be used for calling
- [ ] Only real tiles count for Chow/Pung eligibility

```javascript
// ✅ CORRECT
function canPung(hand, tile, goldTileType) {
  const realMatches = hand.filter(t => t === tile && t !== goldTileType);
  return realMatches.length >= 2;
}

// ❌ INCORRECT
function canPung(hand, tile) {
  return hand.filter(t => t === tile).length >= 2;  // Counts Gold!
}
```

**Manual pass required:**
- [ ] No auto-pass for players with no options
- [ ] All players must click a button
- [ ] Invalid options greyed out but visible

### 6. Scoring (MVP)

**Correct formula:**
```javascript
// ✅ CORRECT
let points = 1;                      // Base
points += bonusTiles.length;         // +1 per bonus
points += goldsInHand;               // +1 per Gold

if (isSelfDraw || isThreeGolds) {
  points *= 2;                       // Self-draw multiplier
}

if (isThreeGolds) {
  points += 20;                      // Three Golds bonus (after multiplier)
}
```

**Common mistakes:**
```javascript
// ❌ INCORRECT - Multiplies special bonus
if (isSelfDraw) {
  points = (points + threeGoldsBonus) * 2;  // Wrong order!
}

// ❌ INCORRECT - Out of scope bonuses
if (noBonusTiles && noKongs) {
  points += 10;  // Not in MVP!
}

// ❌ INCORRECT - Kong scoring
points += concealedKongs * 2 + exposedKongs * 1;  // Not in MVP!
```

**Payment:**
- [ ] All 3 losers pay the winner
- [ ] Each pays the full point total
- [ ] Regardless of who discarded winning tile

### 7. Game Flow

**Turn order:**
- [ ] Counter-clockwise
- [ ] Draw → (expose bonus) → Discard/Win
- [ ] Taking discard skips draw

**Bonus tile handling:**
- [ ] Auto-expose when drawn
- [ ] Draw replacement from wall
- [ ] Chain until non-bonus drawn
- [ ] Check Three Golds after each replacement

**Game end conditions:**
- [ ] Someone wins (standard or Three Golds)
- [ ] Wall exhausted = draw game
- [ ] Wall empty during replacement = draw game

### 8. Multiplayer/State Sync

**Room state:**
- [ ] Room code generation
- [ ] 4 players required
- [ ] Host can select dealer

**Game state sync:**
- [ ] All clients see same game state
- [ ] Private hands only visible to owner
- [ ] Exposed melds visible to all
- [ ] Discard pile visible to all

**Call handling:**
- [ ] Wait for all 4 players to respond
- [ ] No timeout-based auto-pass
- [ ] Resolve by priority after all respond

### 9. Common Bugs to Watch For

**Off-by-one errors:**
```javascript
// ❌ Tile numbers should be 1-9, not 0-8
for (let i = 0; i < 9; i++) { tiles.push(`dots_${i}`); }

// ✅ CORRECT
for (let i = 1; i <= 9; i++) { tiles.push(`dots_${i}`); }
```

**Player index wrapping:**
```javascript
// ❌ Can produce negative numbers
const nextPlayer = (currentPlayer - 1) % 4;

// ✅ CORRECT
const nextPlayer = (currentPlayer + 3) % 4;  // Counter-clockwise
```

**Chow sequence validation:**
```javascript
// ❌ Doesn't check same suit
function isChow(t1, t2, t3) {
  return t2 - t1 === 1 && t3 - t2 === 1;
}

// ✅ CORRECT
function isChow(t1, t2, t3) {
  const [s1, n1] = parseTile(t1);
  const [s2, n2] = parseTile(t2);
  const [s3, n3] = parseTile(t3);
  return s1 === s2 && s2 === s3 && n2 - n1 === 1 && n3 - n2 === 1;
}
```

**Mutable state bugs:**
```javascript
// ❌ Mutates original array
function removeTile(hand, tile) {
  const index = hand.indexOf(tile);
  hand.splice(index, 1);  // Mutates!
  return hand;
}

// ✅ CORRECT
function removeTile(hand, tile) {
  const index = hand.indexOf(tile);
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}
```

## Review Output Format

When reviewing code, output findings in this format:

```markdown
## Code Review: [File/Feature Name]

### ✅ Correct
- [What's implemented correctly]

### ⚠️ Warnings
- [Potential issues or edge cases]

### ❌ Errors
- [Rule violations or bugs]
- **Rule**: [Which rule is violated]
- **Expected**: [Correct behavior]
- **Actual**: [What code does]
- **Fix**: [Suggested fix]

### 🚫 Out of Scope
- [Features that shouldn't be implemented yet]
```

## Usage

To review code, provide:
1. The code to review
2. What feature it implements
3. Any specific concerns

This skill will check against rules and implementation plan.
