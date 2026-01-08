# Future Features

## Dealer Streak System
- If dealer wins, they stay as dealer (don't rotate)
- Dealer gets streak bonus: +1 to base score for every additional consecutive win
  - 1 win: no bonus
  - 2 wins in a row: +1 to base
  - 3 wins in a row: +2 to base
  - 4 wins in a row: +3 to base
- Implementation notes:
  - Add `dealerStreak: number` to session state
  - Update `recordRoundResult()` to increment/reset streak
  - Modify score calculation to add streak bonus
  - Change dealer rotation logic on "Another Round"

## Kong (Quad)
- Allow players to declare Kong (4 of the same tile)
- Concealed Kong vs Exposed Kong
- Draw replacement tile from back of wall
- Affects hand structure (still need 5 sets + 1 pair, but Kong counts as 1 set)

## Winner Screen Redesign
- Make layout wider and less vertical (currently narrow centered column)
- Use horizontal/grid layout for sections:
  - Winner info + winning hand side-by-side with score breakdown
  - Cumulative scores in a compact table
  - Your hand shown inline if not winner
- Better use of screen real estate on desktop

## Adjustable Bot Difficulty
- Allow host to set bot skill level (Easy / Medium / Hard)
- **Easy**: Random discards, never calls, only wins on obvious hands
- **Medium**: Current behavior (shanten-based decisions, safe discards)
- **Hard**: Defensive play (reads opponents' hands), optimal calling decisions, maximizes scoring
- Implementation notes:
  - Add `botDifficulty` setting to room or per-bot
  - Pass difficulty to `useBotRunner` hook
  - Adjust decision thresholds based on level
