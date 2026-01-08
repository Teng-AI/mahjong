# Future Features

## Kong (Quad)
- Allow players to declare Kong (4 of the same tile)
- Concealed Kong vs Exposed Kong
- Draw replacement tile from back of wall
- Affects hand structure (still need 5 sets + 1 pair, but Kong counts as 1 set)

## Adjustable Bot Difficulty
- Allow host to set bot skill level (Easy / Medium / Hard)
- **Easy**: Random discards, never calls, only wins on obvious hands
- **Medium**: Current behavior (shanten-based decisions, safe discards)
- **Hard**: Defensive play (reads opponents' hands), optimal calling decisions, maximizes scoring
- Implementation notes:
  - Add `botDifficulty` setting to room or per-bot
  - Pass difficulty to `useBotRunner` hook
  - Adjust decision thresholds based on level
