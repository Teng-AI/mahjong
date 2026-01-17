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
| **Chi (吃/顺子)** | 3 consecutive tiles, same suit | 2-3-4 Bamboo |
| **Peng (碰/刻子)** | 3 identical tiles | 7-7-7 Dots |
| **Gang (杠/杠子)** | 4 identical tiles | 9-9-9-9 Characters |
| **Pair (眼)** | 2 identical tiles | 5-5 Characters |

**Gold tiles**:
- Can substitute for any tile in sets or pairs
- Each Gold in your winning hand counts as **+1 point**
- Two Golds as your pair = **Golden Pair (+50 bonus)**
- **Cannot be used for calling** (Chi/Peng/Gang) - only for completing your hand

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
- Worth **+30 points** special bonus

#### Robbing the Gold (抢金)
When the Gold tile is revealed at game start, players may claim it to win:

1. **Dealer priority**: If dealer already has a winning hand (without needing the Gold), they win
2. **Tenpai players**: Non-dealers in turn order who are waiting on the Gold tile type can claim it
3. **Dealer swap**: Dealer can swap any non-Gold tile from their hand with the revealed Gold to win

**Scoring**:
- Counts as **self-draw** (×2 multiplier applies)
- Worth **+30 points** special bonus
- The revealed Gold tile becomes part of the winner's hand

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
2. **Declare** gangs or expose bonus tiles (draw replacement from wall)
3. **Discard** one tile face-up, or **win** if hand is complete

### Calling Tiles

When a tile is discarded, other players may call it:

| Action | Priority | Requirement |
|--------|----------|-------------|
| **Hu (胡)** | Highest | Completes your hand |
| **Peng (碰) / Gang (杠)** | High | Have 2 or 3 matching tiles |
| **Chi (吃)** | Lowest | Have 2 sequential tiles |

**Priority tie-breaker**: If multiple players call the same priority, the player **closest to the discarder** (counter-clockwise) wins. Other callers get nothing.

**Chi restriction**: You can only Chi from the player sitting to your **left** (the previous player in turn order).

**Turn interruption**: When you Peng or Gang, it becomes your turn and play continues counter-clockwise from you. Skipped players lose their turn.

**Winning after calling**: If your hand is complete after Chi/Peng/Gang (before discarding), you can **win immediately** — or choose to discard instead (winning is always optional).

### Gangs

| Type | How Formed | Points |
|------|------------|--------|
| **Concealed Gang** | Draw all 4 tiles yourself | +2 |
| **Exposed Gang (from Peng)** | Have exposed Peng, self-draw 4th tile | +1 |
| **Exposed Gang (from discard)** | Have 3 concealed tiles, Gang a discard | +1 |

**Note**: You cannot Gang a discard to add to an existing exposed Peng — only self-draw works.

**Gang rules**:
- After declaring a Gang, draw a replacement from the wall
- If replacement completes your hand, you can **win immediately**
- Three Golds check triggers on Gang replacement draws
- Concealed Gang can be declared **anytime during your turn** (not just after drawing the 4th)
- Concealed Gang stays **face-down** (not revealed to other players)
- If someone discards a tile you have 3 of, you can **choose** to not Gang (keep them concealed)
- Ganging from a discard counts as Exposed (+1), not Concealed (+2)

---

## Scoring

### Formula

```
Non-Special Points = Base + Bonus + Golds + Gangs

If self-draw: Non-Special Points × 2

Total = Non-Special Points + Special Hand Bonuses
```

### Non-Special Points

| Component | Points |
|-----------|--------|
| Base (winning) | +1 |
| Per bonus tile (wind/dragon) | +1 |
| Per Gold tile in hand | +1 (physical Golds, regardless of how used) |
| Per Concealed Gang | +2 |
| Per Exposed Gang | +1 |
| Dealer streak bonus | +N (where N = consecutive rounds as dealer) |

**Self-draw (自摸)**: Multiply non-special points by **2**

**Dealer Streak (连庄)**: When the dealer stays for consecutive rounds (by winning or drawing), they earn a streak bonus equal to their round count. For example, if the dealer stays for 3 rounds in a row, their 3rd round win gets +3 bonus points (added before the self-draw multiplier). Draw games count toward the streak but award no points.

### Special Hand Bonuses

Special bonuses are added **after** the multiplier is applied. However, having ANY special bonus automatically triggers the ×2 multiplier (even on discard wins).

| Hand | Points | Condition |
|------|--------|-----------|
| **No Bonus/Gang (平胡)** | +15 | No exposed bonus tiles AND no gangs |
| **Three Golds (三金)** | +30 | Instant win with all 3 Golds |
| **Robbing the Gold (抢金)** | +30 | Win by claiming the revealed Gold tile |
| **Golden Pair (金对)** | +50 | Pair is 2 Gold tiles |
| **All One Suit (清一色)** | +100 | All tiles in hand are same suit (excluding Golds) |

**Notes**:
- You can have Gold tiles and still qualify for "No Bonus/Gang"
- Special bonuses can stack (e.g., Golden Pair + No Bonus/Gang = +65)
- Three Golds still counts +3 for the Golds in hand (total: 30 + 3 = 33 minimum)
- All special bonuses trigger the ×2 multiplier, even on discard wins

### Payment

**All 3 losers pay the winner** the total amount (regardless of who discarded the winning tile).

### Examples

**Example 1: Self-draw with Golden Pair**
```
Hand: 5 sets + 1 pair (Golden Pair)
Bonus tiles: 3 (wind_east, wind_south, dragon_red)
Golds in hand: 2 (used as pair)
Gangs: 0
Self-draw: Yes

Non-Special: 1 (base) + 3 (bonus) + 2 (golds) = 6
Multiplier:  6 × 2 = 12 (self-draw)
Golden Pair: +50
Total:       62 points (each loser pays 62)
```

**Example 2: Discard win with special bonus**
```
Hand: 5 sets + 1 pair (Golden Pair)
Bonus tiles: 2 (wind_east, wind_south)
Golds in hand: 2 (used as pair)
Gangs: 0
Self-draw: No (won from discard)

Non-Special: 1 (base) + 2 (bonus) + 2 (golds) = 5
Multiplier:  5 × 2 = 10 (special bonus triggers ×2)
Golden Pair: +50
Total:       60 points (each loser pays 60)
```

**Example 3: All One Suit flush**
```
Hand: All bamboo tiles (5 sets + 1 pair)
Bonus tiles: 1 (wind_north)
Golds in hand: 1 (substituting in a set)
Gangs: 1 concealed
Self-draw: No

Non-Special: 1 (base) + 1 (bonus) + 1 (gold) + 2 (concealed gang) = 5
Multiplier:  5 × 2 = 10 (All One Suit triggers ×2)
All One Suit: +100
Total:       110 points (each loser pays 110)
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
- Game is a draw when **all drawable tiles are exhausted** from the wall
- **Dead wall**: 16 tiles are reserved and never drawn (per Fujian tradition)
- **Exception**: If the last drawable tile completes a hand, that player wins
- **Exception**: If the last tile is a bonus tile (no replacement available), it's a draw
- No points exchanged on draw
- Dealer remains the same

---

## Quick Reference

### Tile Counts
- Suit tiles: 108 (playable)
- Bonus tiles: 20 (winds + dragons)
- Gold tiles: 3 in play (1 exposed)
- Dead wall: 16 tiles reserved (not drawable)

### Win Requirements
- Standard: 5 sets + 1 pair
- Three Golds: 3 Gold tiles (instant)
- Robbing the Gold: Claim revealed Gold at game start (instant)

### Key Rules
- Hand size: 16 tiles (17 after draw)
- Chi: Only from player to your left
- Bonus/Gang replacements: Draw from wall
- You can delay winning to go for a bigger hand
- Payment: All 3 losers pay winner
- Dealer streak: Consecutive rounds as dealer add bonus points (wins + draws count)

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
- Wall: single draw position with 16-tile dead wall
- Current dealer
- Seating order: fixed counter-clockwise (South → East → North → West from player's view)

### Win Checks (in order)
1. **Three Golds**: Player has 3 Gold tiles → instant win
2. **Robbing the Gold**: At game start, player can claim revealed Gold to complete hand
3. **Standard win**: 5 sets + 1 pair with 17 tiles

### Scoring Algorithm
```
non_special = 1 + bonus_tiles + golds_in_hand + (concealed_gangs × 2) + (exposed_gangs × 1) + dealer_streak_bonus

# Calculate special bonuses first
special = 0
if no_bonus_tiles and no_gangs:
    special += 15
if golden_pair:
    special += 50
if three_golds:
    special += 30  # also gets +3 from golds_in_hand
if robbing_gold:
    special += 30
if all_one_suit:
    special += 100

# ×2 multiplier applies if self-draw OR any special bonus
if self_draw or three_golds or robbing_gold or special > 0:
    non_special = non_special × 2

total = non_special + special
payment = total × 3  # from all losers
```
