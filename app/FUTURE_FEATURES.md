# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

**Complexity**: 🟢 Easy (< 1 hour) | 🟡 Medium (1-4 hours) | 🔴 Hard (4+ hours)

---

## In Progress
<!-- Currently being worked on -->

---

## High Priority (Bugs)

- [x] **Concealed Kong leaks tile info** 🟢 ✅
  - ~~Game log shows which tile was konged~~ Fixed: shows "declared a concealed Kong"
  - ~~Last Action box also reveals the tile~~ Fixed: shows face-down tiles
  - Added `isConcealed` flag to LastAction type

- [x] **Mobile tile UX broken** 🟡 ✅
  - ~~Tiles overflow or don't fit on small screens~~ Fixed tile text overflow
  - ~~Hand becomes unplayable on narrow devices~~ Responsive sizing improved
  - ~~Fix: Responsive tile sizing, horizontal scroll, or tile stacking~~ Melds now wrap

---

## High Priority (Features)

- [x] **Mobile layout rework** 🔴 ✅
  - Reorganize game UI for portrait mobile screens
  - ~~Reorder middle row: Last Discard → Discard Pile → Game Log~~ ✅ Done
  - ~~Move calling status to bottom~~ ✅ Done
  - ~~Hide sound controls inside Settings modal~~ ✅ Done
  - ~~Move Game Log to bottom on mobile~~ ✅ Done
  - ~~Smaller header on mobile~~ ✅ Done
  - ~~Auto-scroll game log to recent actions~~ ✅ Done
  - ~~PASS button more prominent (emerald green)~~ ✅ Done
  - ~~Fixed bottom action bar for mobile~~ ✅ Done
  - ~~WIN button larger and more prominent~~ ✅ Done
  - ~~Calling status in bottom bar (flips with action buttons)~~ ✅ Done
  - ~~Collapse other players into compact view~~ (Decided not to implement)

- [x] **Calling phase timer** 🔴 ✅
  - ~~Configurable timer: 10s, 30s, 60s, 120s, or no limit~~ 10-120s configurable
  - ~~Auto-pass when timer expires~~ ✅ Done
  - ~~Visual countdown indicator~~ ✅ Done
  - ~~Room setting configured by host~~ ✅ Done

- [x] **Turn timer** 🔴 ✅
  - Configurable timer: 10-120 seconds or no limit
  - Auto-draw and auto-discard when timer expires
  - Auto-win detection if player has winning hand after draw
  - Visual countdown indicator with warning state
  - Room setting configured by host (side-by-side with calling timer)

- [x] **Dead wall implementation** 🟡 ✅
  - ~~Reserve 0-16 tiles as dead wall (unplayable)~~ 16 tiles removed at game start
  - ~~Game ends when live wall exhausted (not total wall)~~ ✅ Done
  - ~~Configurable in room settings~~ (Not needed - hardcoded to 16)
  - ~~Display dead wall count in UI~~ Wall count shows drawable tiles only

---

## Medium Priority

- [x] **Wall count warning colors** 🟢 ✅
  - ~~Yellow highlight when < 10 tiles left~~ Yellow text + background
  - ~~Red highlight when < 5 tiles left~~ Red text + pulsing background
  - Helps players anticipate draw game

- [x] **Dramatic win announcement** 🟡 ✅
  - ~~Add delay before revealing winner (build suspense)~~ Face-down tiles with "The winner is..."
  - ~~Special sound effect / fanfare leading up to win~~ Drumroll during suspense
  - ~~Visual effect (screen flash, zoom, etc.)~~ Tile flip reveal + fly-in animation
  - ~~Makes winning moments more exciting~~ ✅ Done

- [x] **Rename calling actions** 🟢 ✅
  - ~~Make button labels more intuitive for new players~~ Used authentic Mahjong terms
  - Chow → Chi (吃), Pung → Peng (碰), Kong → Gang (杠), Win → Hu (胡)
  - Chinese characters shown in rules modal for education

- [x] **Show last action in discard box** 🟢 ✅
  - ~~Display what action just happened (e.g., "Player drew", "Player called Pung")~~ Added "Previous Action" box
  - ~~Integrate with existing Last Discard section~~ Side-by-side layout
  - ~~Use lastAction from gameState~~ Uses previousAction field

- [ ] **Golden Dragon special bonus** 🟡
  - See detailed spec below

### Golden Dragon (金龙) Specification

**New Bonus: Golden Dragon +100**
- Player has all 3 Gold tiles and uses them as a normal Peng set (triplet)
- Rest of hand must win WITHOUT using any Gold as wildcard
- Can be won from self-draw OR call (discard)
- Triggers ×2 multiplier like other special bonuses

**Changes to Three Golds (三金) +30**
- No longer auto-wins — player sees HU button and decides
- Can declare anytime during own turn when holding 3 Golds
- Works as instant win (no complete hand needed)
- Only available on own turn (not from calls)

**Changes to Golden Pair (金对) +50**
- Only available when player has exactly 2 Gold tiles
- Having 3 Golds disqualifies Golden Pair

**Win Scenarios with 3 Golds**

| Scenario | Bonus |
|----------|-------|
| 3 Golds as Peng, complete hand (self-draw or call) | Golden Dragon +100 |
| 3 Golds as wildcards, win on own turn | Three Golds +30 |
| 3 Golds, no complete hand, declare on own turn | Three Golds +30 |
| 3 Golds as wildcards, win from call | No special Gold bonus |
| Robbing Gold results in 3 Golds | +30 only |

**Bonus Hierarchy (highest only, no stacking)**
1. All One Suit (+100) / Golden Dragon (+100) — if tied, +100 once
2. Golden Pair (+50) — only with exactly 2 Golds
3. Three Golds (+30) / Robbing Gold (+30)
4. No Bonus/Gang (+15)

**Scoring Formula (unchanged structure)**
```
Non-special = base + bonus tiles + golds (count) + gangs + dealer streak
If self-draw OR any special bonus: ×2
Total = non-special + highest special bonus
```

**Implementation Changes Required**
1. Remove Three Golds auto-win trigger
2. Add Golden Dragon detection (3 Golds as Peng, no wildcards in rest of hand)
3. Update Golden Pair to require exactly 2 Golds
4. Update scoring to pick highest special bonus only (no stacking)
5. Update rules modal and documentation

- [ ] **Bonus phase animation delays** 🟡
  - Add visual delays between: expose → replace → gold flip → auto-win check
  - Currently happens too fast to follow
  - Use setTimeout or animation callbacks
  - Show each step clearly before proceeding

- [x] **Error boundaries** 🟡 ✅
  - ~~Wrap components in React error boundaries~~ Next.js error.tsx convention
  - ~~Show friendly error UI instead of white screen~~ Done
  - ~~Log errors for debugging~~ console.error in dev
  - ~~"Something went wrong" + retry button~~ Try Again + Return Home

- [ ] **Loading skeletons** 🟡
  - Replace "Loading..." text with skeleton placeholders
  - Skeleton for: game board, player info, tile hand
  - Better perceived performance

- [ ] **Reconnection handling** 🔴
  - Detect when Firebase connection drops
  - Show "Reconnecting..." indicator
  - Auto-rejoin room/game on reconnect
  - Handle stale state after reconnect

- [ ] **Preview image for sharing (og:image)** 🟡
  - Create social preview image for link sharing
  - Shows game branding when shared on social media
  - Update meta tags in layout.tsx
  - Design 1200x630 image

---

## Low Priority

- [ ] **Manual hand sorting** 🟡
  - Drag-and-drop to reorder tiles in hand
  - Persist order during game
  - Use react-dnd or similar library
  - Touch-friendly for mobile

- [ ] **Tile images instead of text** 🔴
  - Replace emoji/text tiles with actual mahjong tile images
  - Need: 34 unique tile designs × multiple states (normal, gold, selected)
  - SVG or PNG sprite sheet
  - Significant visual overhaul

- [ ] **Server-side tile drawing** 🔴
  - Move tile draw logic from client to Firebase Cloud Functions
  - Prevents client-side cheating/manipulation
  - Requires Firebase Functions setup
  - More complex state management

- [ ] **Accessibility (a11y)** 🟡
  - Add ARIA labels to interactive elements
  - Screen reader support for game state
  - Keyboard navigation (beyond shortcuts)
  - Color contrast compliance

- [ ] **Individual sound toggles** 🟢
  - Per-sound enable/disable in settings
  - e.g., disable "your turn" but keep "win" sound
  - Checkbox list in Settings modal

- [ ] **Game history/replay** 🔴
  - Record all game actions
  - Playback completed games turn-by-turn
  - Store in Firebase or export as JSON
  - Complex UI for replay controls

- [ ] **Tutorial/onboarding** 🔴
  - Interactive tutorial for new players
  - Step-by-step guided first game
  - Highlight UI elements, explain rules
  - Significant content creation

- [ ] **PWA support** 🟡
  - Add manifest.json for "Add to Home Screen"
  - Service worker for offline capability
  - App icon and splash screen
  - next-pwa package

- [ ] **Analytics** 🟡
  - Track user behavior (games played, win rates, etc.)
  - Privacy-respecting (no PII)
  - Vercel Analytics or custom solution

---

## Backlog
<!-- Ideas for the distant future -->

- [ ] **Spectator mode** 🔴
  - Watch ongoing games without playing
  - Read-only view of game state
  - Join mid-game as observer

- [ ] **In-game chat** 🟡
  - Text chat between players during game
  - Chat bubbles or side panel
  - Emoji reactions

- [ ] **Custom room settings** 🔴
  - Time limits per turn
  - House rules (no chow, etc.)
  - Starting points
  - Number of rounds

- [ ] **Leaderboards / player stats** 🔴
  - Persistent player accounts (not anonymous)
  - Track wins, scores, streaks
  - Global leaderboard
  - Requires auth overhaul

- [ ] **Social sharing of wins** 🟡
  - Share winning hand to social media
  - Generate image of final hand + score
  - Copy-paste or direct share

- [ ] **Multiple game variants** 🔴
  - Support other Mahjong rules (Hong Kong, Japanese, etc.)
  - Major refactor of game logic
  - Different tile sets, scoring, win conditions

---

## Completed

- [x] **Dead wall** - 16 tiles reserved at game start (per Fujian Mahjong rules)
- [x] **UI cleanup** - removed seat labels (East/South/West/North), compact Kong display (×4 badge)
- [x] **Mobile layout rework complete** - fixed bottom action bar, calling status integration
- [x] Fixed bottom action bar for mobile (Draw/Discard/calling buttons)
- [x] WIN button larger and more prominent on mobile
- [x] Calling status shows in bottom bar (flips between buttons and status)
- [x] Bot delay waits for human response before starting
- [x] Previous Action box showing draw/call before discard
- [x] Mobile game log auto-scrolls to recent actions
- [x] Page scrolls to top when starting new round
- [x] Mobile tile text overflow fix (character tiles)
- [x] Melds wrap to next line when overflowing
- [x] PASS button changed to emerald green for prominence
- [x] Mobile header made smaller (reduced padding, text sizes)
- [x] Mobile game log moved to bottom
- [x] Game layout reorganization (calling status to bottom, middle row reordered)
- [x] **Bug fix**: Win sound loop now respects sound enabled setting
- [x] Renamed "UPGRADE" button to "KONG" for pung upgrades
- [x] Bot names now include number (Bot-E1, Bot-M2, Bot-H3)
- [x] Sound controls moved to Settings modal (cleaner header)
- [x] **Bug fix**: Concealed Kong now shows face-down tiles to other players
- [x] **Bug fix**: Keyboard shortcuts hidden on mobile/touch devices
- [x] All One Suit bonus scoring (+60 points)
- [x] Winner celebration effects (fireworks, fanfare, sparkles)
- [x] Player turn order UI (all 4 players shown, green highlight)
- [x] Clickable rules modal
- [x] Keyboard shortcuts (customizable)
- [x] Sound volume control
- [x] Kong implementation (concealed, exposed, upgrade)
- [x] Winner screen redesign
- [x] Sound effects
- [x] Bot difficulty (easy/medium/hard)
- [x] Dealer streak tracking
- [x] Vercel deployment
- [x] Firebase security rules
- [x] SEO metadata and Open Graph tags
- [x] Branding (Mahjong Vibes)
- [x] Debug logging (dev-only)
- [x] Auth state feedback
- [x] Copy room code button
- [x] Test coverage (123 tests)
- [x] CHANGELOG.md
- [x] Pre-commit hooks
- [x] `/docs-sync` and `/session-wrap` skills
- [x] Lint cleanup
- [x] Turn Indicator (N/E/S/W round table view showing current/previous actor)
- [x] Full keyboard controls (customizable shortcuts for Draw, Win, Kong, Pung, Chow, Pass)
- [x] Kong keyboard selection with unified button and arrow key navigation
- [x] Chow keyboard selection (arrow keys, Space to select, Enter to confirm)
- [x] Comprehensive rules modal rewrite with all game nuances
- [x] Scoring fix: special bonuses trigger ×2 multiplier on discard wins
- [x] Rules documentation sync (`mahjong-fujian-rules.md`)
- [x] Calling phase timer (10-120s configurable, auto-pass on expire)
- [x] Turn timer with auto-draw/discard and auto-win detection on expire
- [x] Quick Play button on home page (one-click game vs 3 bots with difficulty selection)
- [x] Kong replacement tile now auto-selected for discard (bug fix)
- [x] Winner reveal suspense animation (face-down tiles → flip reveal → fly-in → fade)
- [x] Drumroll sound during winner suspense
- [x] Sound rebalancing with modern design hierarchy (ambient/feedback/event/alert/climax tiers)
- [x] Private draw info in game log (only you see what you drew)
- [x] Bug fix: Turn timer no longer auto-draws on dealer's first turn
- [x] Bug fix: Other players' tile count correctly accounts for Kong replacement draws
- [x] Bug fix: Selected tile clears when turn passes
- [x] Bug fix: Dealer streak now counts draw games (UI shows "N-round streak")
- [x] Renamed calling actions to authentic Mahjong terms (Chi, Peng, Gang, Hu)
