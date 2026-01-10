# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

**Complexity**: 🟢 Easy (< 1 hour) | 🟡 Medium (1-4 hours) | 🔴 Hard (4+ hours)

---

## In Progress
<!-- Currently being worked on -->

---

## High Priority (Bugs)

- [ ] **Mobile tile UX broken** 🟡
  - Tiles overflow or don't fit on small screens
  - Hand becomes unplayable on narrow devices
  - Fix: Responsive tile sizing, horizontal scroll, or tile stacking

---

## High Priority (Features)

- [ ] **Mobile layout rework** 🔴
  - Reorganize game UI for portrait mobile screens
  - ~~Reorder middle row: Last Discard → Discard Pile → Game Log~~ ✅ Done
  - ~~Move calling status to bottom~~ ✅ Done
  - ~~Hide sound controls inside Settings modal~~ ✅ Done
  - Collapse other players into compact view
  - Consider bottom sheet for action buttons

- [ ] **Calling phase timer** 🔴
  - Configurable timer: 10s, 30s, 60s, 120s, or no limit
  - Auto-pass when timer expires
  - Visual countdown indicator
  - Room setting configured by host
  - *Note: Previously attempted, reverted due to Firebase sync issues*

- [ ] **Dead wall implementation** 🟡
  - Reserve 0-16 tiles as dead wall (unplayable)
  - Game ends when live wall exhausted (not total wall)
  - Configurable in room settings
  - Display dead wall count in UI

---

## Medium Priority

- [ ] **Rename calling actions** 🟢
  - Make button labels more intuitive for new players
  - e.g., "Pung" → "Triple", "Chow" → "Sequence"
  - Or add tooltips explaining each action

- [ ] **Show last action in discard box** 🟢
  - Display what action just happened (e.g., "Player drew", "Player called Pung")
  - Integrate with existing Last Discard section
  - Use lastAction from gameState

- [ ] **Bonus phase animation delays** 🟡
  - Add visual delays between: expose → replace → gold flip → auto-win check
  - Currently happens too fast to follow
  - Use setTimeout or animation callbacks
  - Show each step clearly before proceeding

- [ ] **Error boundaries** 🟡
  - Wrap components in React error boundaries
  - Show friendly error UI instead of white screen
  - Log errors for debugging
  - "Something went wrong" + retry button

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
- [x] Test coverage (58 tests)
- [x] CHANGELOG.md
- [x] Pre-commit hooks
- [x] `/docs-sync` and `/session-wrap` skills
- [x] Lint cleanup
