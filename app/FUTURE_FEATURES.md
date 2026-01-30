# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

**Complexity**: 🟢 Easy (< 1 hour) | 🟡 Medium (1-4 hours) | 🔴 Hard (4+ hours)

**Last reviewed:** 2026-01-30

---

## Critical (Tech Debt)

> ⚠️ Address these BEFORE adding new features

- [x] **Refactor game page** 🔴 ✅ Major progress
  - Reduced from 3,665 → 2,078 lines (43% reduction)
  - Extracted: GameHeader, GameLog, MobileActionBar, DiscardPile, Tile, Hand
  - Extracted: DrawGameScreen, WinnerSuspenseScreen, WinnerResultsScreen
  - PlayersGrid/CallingStatusBar kept inline (extraction caused bugs)

- [ ] **Timer visibility bug (mobile freeze)** 🟡 ⚠️ HIGH PRIORITY
  - **Bug:** Game freezes on mobile after screen lock during calling phase
  - **Root cause:** Timer hooks (`useCallingTimer`, `useTurnTimer`) don't handle page visibility changes
  - When screen locks, `setInterval` pauses; on unlock, auto-pass fires once but doesn't retry if Firebase write fails
  - **Fix needed:**
    - Add `visibilitychange` listener to timer hooks
    - On page visible: recalculate timer, retry `onExpire` if expired
    - Consider checking Firebase connection status before auto-pass attempts
  - **Related to:** Reconnection handling (below)

---

## High Priority (Retention & Growth Blockers)

> These directly impact whether users stay or leave

- [ ] **Reconnection handling** 🔴
  - Detect when Firebase connection drops
  - Show "Reconnecting..." indicator
  - Auto-rejoin room/game on reconnect
  - Handle stale state after reconnect
  - Use `reconnectCount` from `useFirebaseConnection` to trigger re-syncs
  - **Impact:** Reduces mobile churn from ~30% to ~10%

- [ ] **PWA support** 🟡
  - Add manifest.json for "Add to Home Screen"
  - Service worker for offline capability
  - App icon and splash screen
  - Push notifications ("Your game is ready!")
  - Use `next-pwa` package
  - **Impact:** +30-50% daily active users from mobile

- [ ] **Auto-pilot (AFK mode)** 🟡
  - Player can toggle auto-play while away
  - Bot AI takes over their seat temporarily
  - Visual indicator showing player is on auto-pilot
  - **Impact:** Games don't stall when someone steps away

- [ ] **Refactor game page (continued)** 🟢
  - Currently ~2,096 lines - close to target (<2,000)
  - **Easy extractions:**
    - CallingStatusBar (~32 lines) - who's responded during calling
    - Toast/Notifications (~12 lines) - turn flash + error banners
  - **Medium extractions:**
    - useOfflineWatchdog hook (~96 lines) - clean boundary
    - PlayersGrid (~100 lines) - ⚠️ tried before, caused bugs
  - **Harder extractions:**
    - MyHandSection (~290 lines) - hand + melds + selection modes
    - useGameKeyboardShortcuts (~230 lines) - many dependencies

- [ ] **Architecture review** 🟢
  - Review project structure and dependencies
  - Identify tech debt and code smells
  - Document architectural decisions
  - Check for missing CI/branch protections

---

## Medium Priority (UX Polish & Engagement)

> Improves experience for existing users

- [ ] **Mobile Kong/Chow selection modal** 🟢
  - Replace inline tile highlighting with bottom sheet modal
  - Clearer selection UI on small screens
  - **Impact:** Better UX for 50% of users

- [x] **Spectator mode** 🟡 ✅
  - Read-only view for non-players joining a game room
  - Shows all exposed tiles, timers, and game log

- [ ] **Social sharing of wins** 🟡
  - Share winning hand to social media
  - Generate image of final hand + score
  - Copy-paste or direct share

- [ ] **In-game chat** 🟡
  - Emoji reactions only (avoid toxicity/moderation)
  - "Good game" / "Nice!" quick reactions
  - Chat bubbles during game

---

## Low Priority (Nice to Have)

> Good ideas, but not growth-driving

- [ ] **Accessibility (a11y)** 🟡
  - Add ARIA labels to interactive elements
  - Screen reader support for game state
  - Keyboard navigation (beyond shortcuts)
  - Color contrast compliance

- [ ] **Error boundary testing** 🟢
  - Test error pages against actual Firebase failures
  - Verify recovery flows work

---

## Deprioritized

> Documented for future reference, but not recommended to build now

- [ ] **Player profiles + persistent identity** 🟡
  - Replace anonymous auth with guest ID (localStorage) or optional email
  - Track personal stats: games played, win rate, favorite opponents
  - *Reason: Nice-to-have, not critical for core gameplay*

- [ ] **Tutorial / onboarding** 🔴
  - Interactive 5-minute first-game tutorial with bot teacher
  - *Reason: High effort, Quick Play + Rules modal covers most needs*

- [ ] **Public rooms / matchmaking** 🔴
  - Browse list of open rooms, "Quick Join" to auto-match
  - *Reason: Requires player profiles first, complex infrastructure*

- [ ] **Analytics** 🟡
  - Track games played, win rates, session length
  - *Reason: Not needed until user base grows*

- [ ] **Opponent discard history** 🟢
  - Show what each opponent has discarded (compact view)
  - *Reason: Already visible in game log, low demand*

- [ ] **Hook test coverage** 🟡
  - `useGame.ts` and `useBotRunner.ts` are untested
  - *Reason: Core logic already tested in lib/game.ts, hook testing is tedious/low ROI*

- [ ] **Golden Dragon special bonus** 🟡
  - Complex rule variant (+100 for 3 Golds as Peng set)
  - Only matters to hardcore players
  - Overcomplicates rules for new players
  - *Reason: Doesn't drive growth, adds complexity*

- [ ] **Bonus phase animation delays** 🟡
  - Slow down expose → replace → gold flip sequence
  - *Reason: Polish item, no user complaints*

- [ ] **Loading skeletons** 🟡
  - Replace "Loading..." with skeleton placeholders
  - *Reason: Game loads fast enough, perceived perf not an issue*

- [ ] **Manual hand sorting** 🟡
  - Drag-and-drop to reorder tiles
  - *Reason: Complex to build, most players don't care*

- [ ] **Tile images instead of text** 🔴
  - Replace emoji with actual mahjong tile graphics
  - *Reason: Huge effort, current tiles work fine*

- [ ] **Server-side tile drawing** 🔴
  - Move logic to Firebase Cloud Functions (anti-cheat)
  - *Reason: Overkill for casual friends game*

- [ ] **Game history/replay** 🔴
  - Record and playback completed games
  - *Reason: Complex, low demand — who rewatches mahjong?*

- [ ] **Multiple game variants** 🔴
  - Support Hong Kong, Japanese, etc. rules
  - *Reason: Scope creep — stay focused on Fuzhou*

- [ ] **Custom room settings (house rules)** 🟡
  - No chow, different scoring, etc.
  - *Reason: Fragments player base, timers already configurable*

- [ ] **Leaderboards / global rankings** 🔴
  - Requires persistent accounts
  - *Reason: Build player profiles first*

---

## Completed

- [x] **Preview image for sharing** - OG image with headline + CTA (111KB)
- [x] **Fuzhou Mahjong rebrand** - Consistent 福州麻将 naming throughout
- [x] **Dead wall** - 16 tiles reserved at game start
- [x] **Mobile layout rework** - Fixed bottom action bar, calling status integration
- [x] **Calling phase timer** - 10-120s configurable, auto-pass on expire
- [x] **Turn timer** - Auto-draw/discard, auto-win detection
- [x] **Error boundaries** - Friendly error UI with recovery options
- [x] **Winner reveal animation** - Suspense → flip reveal → fly-in
- [x] **Renamed calling actions** - Chi, Peng, Gang, Hu with Chinese characters
- [x] **Quick Play** - One-click game vs 3 bots
- [x] **Kong implementation** - Concealed, exposed, upgrade
- [x] **Keyboard shortcuts** - Fully customizable
- [x] **Sound system** - 9+ effects with volume control
- [x] **Turn indicator** - N/E/S/W round table view
- [x] **Comprehensive rules modal** - All game nuances documented
- [x] **Bot AI** - 3 difficulty levels
- [x] **Dealer streak tracking** - Counts wins and draws
- [x] **All One Suit bonus** - +100 points
- [x] **Golden Pair bonus** - +50 points
- [x] **Test coverage** - 131 tests (tiles, settle, game)
- [x] **CI/CD** - GitHub Actions, pre-commit hooks
- [x] **SEO** - Meta tags, Open Graph, favicon

---

## Notes

### Target Audience
- **Primary:** Fuzhounese diaspora who want to play online with friends/family
- **Secondary:** Mahjong enthusiasts curious about regional variants

### Growth Strategy
1. **Retention first:** Fix reconnection, add PWA
2. **Identity:** Player profiles create habit loop
3. **Acquisition:** Tutorial lowers barrier, matchmaking solves discovery
4. **Viral:** Spectator mode + social sharing

### Technical Priorities
1. Refactor game page (unblocks everything)
2. Add hook tests (reduces bugs)
3. Then build growth features
