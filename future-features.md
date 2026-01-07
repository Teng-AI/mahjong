# Future Features

Rules and features to implement in future iterations.

---

## Robbing the Gold (抢金)

An instant win that occurs at the **very start** of the hand, before normal play begins.

### How It Works
- **Check order**: Counter-clockwise from dealer (non-dealers first, dealer last)
- **Non-dealers (16 tiles)**: If one tile away from winning, can take the exposed Gold
- **Dealer (17 tiles)**: If already winning OR one-away, can win immediately
  - If already winning: declare win (still counts as Robbing the Gold)
  - If one-away: swap any tile with the Gold to complete
- First eligible player in order gets to rob

### Scoring
- Counts as **self-draw** (×2 multiplier applies)
- **Always worth +20 points** (even if dealer already had a winning hand)

### Implementation Notes
- Check all 4 players' hands at game start for "one-away" or winning status
- Complex turn order logic needed
- Dealer win detection before game even starts
- Need "one-away" detection algorithm (hand that needs 1 tile to complete)

### Setup Step (when implemented)
After flipping the Gold tile, add this step:
```
Check for Robbing the Gold (counter-clockwise, non-dealers first)
```

---

## Kongs (杠子)

Deferred from MVP to simplify initial build.

### Three Kong Types

| Type | How Formed | Points |
|------|------------|--------|
| **Concealed Kong** | Draw all 4 tiles yourself | +2 |
| **Exposed Kong (from Pung)** | Have exposed Pung, self-draw 4th tile | +1 |
| **Exposed Kong (from discard)** | Have 3 concealed tiles, Kong a discard | +1 |

### Kong Rules
- After declaring a Kong, draw a replacement from the wall
- If replacement completes your hand, you can win immediately
- Three Golds check triggers on Kong replacement draws
- Concealed Kong can be declared anytime during your turn
- Concealed Kong stays face-down (not revealed to other players) — or reveal all for simplicity
- Cannot Kong a discard onto an existing exposed Pung (self-draw only)
- Konging from a discard counts as Exposed (+1), not Concealed (+2)

### Implementation Notes
- Track Kong type (concealed vs exposed) for scoring
- Handle replacement draws after Kong declaration
- Three Golds check on replacement
- Update win detection: Kong = 4 tiles counts as 1 set
- Hand size changes: 16 base + 1 per Kong declared

---

## Golden Pair (金对) — +30 Bonus

Deferred from MVP to simplify win detection.

### How It Works
- If your winning hand's **pair** consists of **2 Gold tiles** → +30 bonus points
- Added after self-draw multiplier (not multiplied)

### Implementation Notes
- When a hand wins, need to find the "best" interpretation
- Multiple valid ways to form 5 sets + 1 pair may exist
- Must check if any valid interpretation uses 2 Golds as the pair
- Requires optimization during win detection, not just validity check

---

## No Bonus/Kong Bonus (平胡) — +10 Bonus

Deferred from MVP to simplify scoring.

### How It Works
- If you win with **no exposed bonus tiles** AND **no kongs** → +10 bonus points
- You can still have Gold tiles in hand and qualify
- Added after self-draw multiplier (not multiplied)

### Implementation Notes
- Simple conditional check at scoring time
- Requires Kong system to be implemented first

---

## Multi-Hand Game Structure

Deferred from MVP — building single-hand mode first.

### Full Game Structure
- **Hand**: One deal until someone wins or wall exhausts
- **Round**: 4 hands
- **Game**: 4 rounds = 16 hands total

### Dealer Rotation
- Dealer wins → dealer stays
- Someone else wins → rotate counter-clockwise
- Draw game → dealer stays

### Implementation Notes
- Track cumulative scores across hands
- Persist dealer position between hands
- Game end condition: after 16 hands, highest score wins
- Could offer quick mode (4 hands) vs full mode (16 hands)

---

## Other Potential Future Features

### Manual Hand Organization
- Allow players to drag-and-drop tiles to rearrange their hand
- "Sort" button to auto-sort back to default order
- Helps players group tiles by strategy (e.g., keep potential melds together)
- MVP uses auto-sort only

### Wall Drawing from Opposite Ends
- Normal draws from one end
- Replacement draws (bonus tiles, Kongs) from opposite end
- More traditional mahjong feel

### Gold Flip Dealer Bonus
- If wind/season is flipped for Gold, dealer takes it as +1 bonus
- Keep flipping until a suit tile is revealed
- Adds slight randomness to dealer advantage
