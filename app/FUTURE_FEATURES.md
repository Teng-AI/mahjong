# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

**Complexity**: 🟢 Easy (< 1 hour) | 🟡 Medium (1-4 hours) | 🔴 Hard (4+ hours)

**Last reviewed:** 2026-01-19 (comprehensive project review)

---

## Critical (Tech Debt)

> ⚠️ Address these BEFORE adding new features

- [ ] **Refactor game page** 🔴
  - Current `page.tsx` is 3,665 lines — unmaintainable
  - Extract into separate components: GameBoard, PlayerCards, CallingUI, TimerUI, Modals
  - Unblocks all future feature development
  - **Do this first or complexity will kill productivity**

- [ ] **Add hook test coverage** 🟡
  - `useGame.ts` and `useBotRunner.ts` are complex and untested
  - Core gameplay logic needs test coverage
  - Reduces bugs in multiplayer sync

---

## High Priority (Retention & Growth Blockers)

> These directly impact whether users stay or leave

- [ ] **Reconnection handling** 🔴
  - Detect when Firebase connection drops
  - Show "Reconnecting..." indicator
  - Auto-rejoin room/game on reconnect
  - Handle stale state after reconnect
  - **Impact:** Reduces mobile churn from ~30% to ~10%

- [ ] **PWA support** 🟡
  - Add manifest.json for "Add to Home Screen"
  - Service worker for offline capability
  - App icon and splash screen
  - Push notifications ("Your game is ready!")
  - Use `next-pwa` package
  - **Impact:** +30-50% daily active users from mobile

- [ ] **Player profiles + persistent identity** 🟡
  - Replace anonymous auth with guest ID (localStorage) or optional email
  - Track personal stats: games played, win rate, favorite opponents
  - Show stats on game end: "You've won 12 of 34 games (35%)"
  - **Impact:** Creates habit loop — players return to improve stats

- [ ] **Tutorial / onboarding** 🔴
  - Interactive 5-minute first-game tutorial with bot teacher
  - Step-by-step: "This is a Peng. You need 3 matching tiles."
  - Show winning hand examples
  - **Impact:** Converts 40% more first-time players

- [ ] **Public rooms / matchmaking** 🔴
  - Browse list of open rooms (with filters)
  - "Quick Join" to auto-match with strangers
  - Simple win-rate leaderboard (top 100)
  - **Impact:** Solves "no one to play with" — unlocks network effects

---

## Medium Priority (UX Polish & Engagement)

> Improves experience for existing users

- [ ] **Mobile Kong/Chow selection modal** 🟢
  - Replace inline tile highlighting with bottom sheet modal
  - Clearer selection UI on small screens
  - **Impact:** Better UX for 50% of users

- [ ] **Opponent discard history** 🟢
  - Show what each opponent has discarded (compact view)
  - Helps intermediate players with strategy
  - Currently only visible in game log

- [ ] **Spectator mode** 🟡
  - Invite friends to watch your game
  - Read-only view of all hands + play log
  - **Impact:** Drives viral/social sharing

- [ ] **Social sharing of wins** 🟡
  - Share winning hand to social media
  - Generate image of final hand + score
  - Copy-paste or direct share

- [ ] **In-game chat** 🟡
  - Emoji reactions only (avoid toxicity/moderation)
  - "Good game" / "Nice!" quick reactions
  - Chat bubbles during game

- [ ] **Analytics** 🟡
  - Track games played, win rates, session length
  - Privacy-respecting (no PII)
  - Vercel Analytics or custom solution

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
