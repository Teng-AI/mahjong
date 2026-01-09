# Fujian (Fuzhou) Mahjong Rules

A beginner-friendly variant popular in Fujian Province, also known as **"Gold Rush Mahjong"** (金麻将).

---

## Tiles (128 total)

| Category | Tiles | Count | Notes |
|----------|-------|-------|-------|
| **Dots (筒子)** | 1-9 | 36 | 4 copies each |
| **Bamboo (条子)** | 1-9 | 36 | 4 copies each |
| **Characters (万子)** | 1-9 | 36 | 4 copies each |
| **Winds (风牌)** | East, South, West, North | 16 | Bonus tiles (4 copies each) |
| **Red Dragon (红中)** | 中 | 4 | Bonus tiles |

**Note**: This variant uses Red Dragons instead of Flowers/Seasons.

### Gold Tile (金牌)

The defining feature of Fujian Mahjong:

- At game start, one **suit tile** is flipped face-up from the wall to become the Gold
- The flipped tile stays visible but is **not used** in play
- Only **3 Gold tiles remain** in the game (the other 3 copies of that tile type)
- Gold tiles can substitute for **any tile** in sets or pairs

### Bonus Tiles (20 total)

Winds (16) and Red Dragons (4) are bonus tiles. When drawn:
1. Expose face-up in front of you (fixed in place)
2. Draw a replacement from the wall
3. If replacement is also a bonus tile, expose it and draw again
4. Continue until you have no bonus tiles in hand
5. Worth +1 point each at game end

**Notes**:
- Three Golds can trigger during replacement draws
- If wall is empty when you need a replacement, the game is a draw

---

## Winning

### Standard Win

**5 sets + 1 pair = 17 tiles**

| Set Type | Description | Example |
|----------|-------------|---------|
| **Chow (顺子)** | 3 consecutive tiles, same suit | 2-3-4 Bamboo |
| **Pung (刻子)** | 3 identical tiles | 7-7-7 Dots |
| **Kong (杠子)** | 4 identical tiles | 9-9-9-9 Characters |
| **Pair (眼)** | 2 identical tiles | 5-5 Characters |

**Gold tiles**:
- Can substitute for any tile in sets or pairs
- Each Gold in your winning hand counts as **+1 point**
- Two Golds as your pair = **Golden Pair (+30 bonus)**
- **Cannot be used for calling** (Chow/Pung/Kong) - only for completing your hand

**Winning is optional**: You are never forced to win.
- If someone discards a tile that completes your hand, you can choose NOT to call it
- If you self-draw a tile that completes your hand, you can discard instead of declaring win
- Common reasons: waiting for self-draw (×2), hoping for Golden Pair, or a higher-scoring hand

### Instant Wins

These trigger immediately without needing a complete hand:

#### Three Golds (三金)
- Collect all 3 Gold tiles in your hand → **instant win**
- Can happen anytime during the game (including during replacement draws)
- Counts as **self-draw** (×2 multiplier applies)
- Worth **+20 points** special bonus

---

## Gameplay

### Setup
1. **First game only**: Roll dice to select initial dealer randomly
2. Build the wall (16 tiles × 2 high per player)
3. Roll dice to determine break point
4. Deal 16 tiles to each player (dealer gets 17)
5. Players expose bonus tiles in **turn order** (dealer first, then counter-clockwise)
   - Each player keeps drawing replacements until no bonus tiles remain in hand
   - **Three Golds can trigger during this phase** (instant win)
6. Flip a **suit tile** to determine Gold (this tile stays visible, not used)
7. Dealer begins play (or wins immediately if hand is complete)

### Turn Order
1. **Draw** from the wall (skip if you just took a discard)
2. **Declare** kongs or expose bonus tiles (draw replacement from wall)
3. **Discard** one tile face-up, or **win** if hand is complete

### Calling Tiles

When a tile is discarded, other players may call it:

| Action | Priority | Requirement |
|--------|----------|-------------|
| **Win (胡)** | Highest | Completes your hand |
| **Kong (杠)** | High | Have 3 matching tiles |
| **Pung (碰)** | Medium | Have 2 matching tiles |
| **Chow (吃)** | Lowest | Have 2 sequential tiles |

**Priority tie-breaker**: If multiple players call the same priority, the player **closest to the discarder** (counter-clockwise) wins. Other callers get nothing.

**Chow restriction**: You can only Chow from the player sitting to your **left** (the previous player in turn order).

**Turn interruption**: When you Pung or Kong, it becomes your turn and play continues counter-clockwise from you. Skipped players lose their turn.

**Winning after calling**: If your hand is complete after Chow/Pung/Kong (before discarding), you can **win immediately** — or choose to discard instead (winning is always optional).

### Kongs

| Type | How Formed | Points |
|------|------------|--------|
| **Concealed Kong** | Draw all 4 tiles yourself | +2 |
| **Exposed Kong (from Pung)** | Have exposed Pung, self-draw 4th tile | +1 |
| **Exposed Kong (from discard)** | Have 3 concealed tiles, Kong a discard | +1 |

**Note**: You cannot Kong a discard to add to an existing exposed Pung — only self-draw works.

**Kong rules**:
- After declaring a Kong, draw a replacement from the wall
- If replacement completes your hand, you can **win immediately**
- Three Golds check triggers on Kong replacement draws
- Concealed Kong can be declared **anytime during your turn** (not just after drawing the 4th)
- Concealed Kong stays **face-down** (not revealed to other players)
- If someone discards a tile you have 3 of, you can **choose** to not Kong (keep them concealed)
- Konging from a discard counts as Exposed (+1), not Concealed (+2)

---

## Scoring

### Formula

```
Non-Special Points = Base + Bonus + Golds + Kongs

If self-draw: Non-Special Points × 2

Total = Non-Special Points + Special Hand Bonuses
```

### Non-Special Points

| Component | Points |
|-----------|--------|
| Base (winning) | +1 |
| Per bonus tile (wind/dragon) | +1 |
| Per Gold tile in hand | +1 (physical Golds, regardless of how used) |
| Per Concealed Kong | +2 |
| Per Exposed Kong | +1 |

**Self-draw (自摸)**: Multiply non-special points by **2**

### Special Hand Bonuses

Added after the self-draw multiplier (not multiplied):

| Hand | Points | Condition |
|------|--------|-----------|
| **No Bonus/Kong (平胡)** | +10 | No exposed bonus tiles AND no kongs |
| **Three Golds (三金)** | +20 | Instant win with all 3 Golds |
| **Golden Pair (金对)** | +30 | Pair is 2 Gold tiles |

**Notes**:
- You can have Gold tiles and still qualify for "No Bonus/Kong"
- Special bonuses can stack (e.g., Golden Pair + No Bonus/Kong = +40)
- Three Golds still counts +3 for the Golds in hand (total: 20 + 3 = 23 minimum)

### Payment

**All 3 losers pay the winner** the total amount (regardless of who discarded the winning tile).

### Example

```
Hand: 5 sets + 1 pair (Golden Pair)
Bonus tiles: 3 (wind_east, wind_south, dragon_red)
Golds in hand: 2 (used as pair)
Kongs: 0
Self-draw: Yes

Non-Special: 1 (base) + 3 (bonus) + 2 (golds) = 6
Self-draw:   6 × 2 = 12
Golden Pair: +30
Total:       42 points (each loser pays 42)
```

---

## Game Flow

### Structure
- **Hand**: One deal until someone wins or wall is exhausted
- **Round**: 4 hands
- **Game**: 4 rounds (16 hands total)

### Dealer Rotation
- Dealer **wins** → dealer stays
- Someone else wins → rotate **counter-clockwise**
- Draw game (wall exhausted) → dealer stays

### Draw Game (流局)
- Game is a draw when **all tiles are completely drawn** from the wall
- No dead wall - play continues until the wall is empty
- **Exception**: If the last tile drawn completes a hand, that player wins
- **Exception**: If the last tile is a bonus tile (no replacement available), it's a draw
- No points exchanged on draw
- Dealer remains the same

---

## Quick Reference

### Tile Counts
- Suit tiles: 108 (playable)
- Bonus tiles: 20 (winds + dragons)
- Gold tiles: 3 in play (1 exposed)
- No dead wall (play until wall is empty)

### Win Requirements
- Standard: 5 sets + 1 pair
- Three Golds: 3 Gold tiles (instant)

### Key Rules
- Hand size: 16 tiles (17 after draw)
- Chow: Only from player to your left
- Bonus/Kong replacements: Draw from wall
- You can delay winning to go for a bigger hand
- Payment: All 3 losers pay winner

---

## Implementation Notes

### Tile IDs
```
Suits:   dots_1-9, bamboo_1-9, characters_1-9
Winds:   wind_east, wind_south, wind_west, wind_north
Dragons: dragon_red (4 copies)
Gold:    Determined at game start (3 copies in play)
```

### Game State
- Gold tile type (which tile is wild, always a suit tile)
- Exposed Gold tile (visible, not in play)
- Each player: concealed tiles, exposed melds, bonus tiles, Gold count
- Wall: single draw position (no dead wall)
- Current dealer
- Seating order: fixed counter-clockwise (East → South → West → North)

### Win Checks (in order)
1. **Three Golds**: Player has 3 Gold tiles → instant win
2. **Standard win**: 5 sets + 1 pair with 17 tiles

### Scoring Algorithm
```
non_special = 1 + bonus_tiles + golds_in_hand + (concealed_kongs × 2) + (exposed_kongs × 1)

# Self-draw and Three Golds count as self-draw
if self_draw or three_golds:
    non_special = non_special × 2

special = 0
if no_bonus_tiles and no_kongs:
    special += 10
if golden_pair:
    special += 30
if three_golds:
    special += 20  # also gets +3 from golds_in_hand

total = non_special + special
payment = total × 3  # from all losers
```
