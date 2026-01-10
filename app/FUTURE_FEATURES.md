# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

## In Progress
<!-- Currently being worked on -->

## High Priority (Bugs)
<!-- Should be fixed soon -->

- [ ] **Bug**: Concealed Kong visible to other players (should be face-down)
- [ ] **Bug**: Mobile tile UX - tiles don't fit properly on small screens
- [ ] **Bug**: Keyboard shortcut changes break on mobile

## High Priority (Features)
<!-- Should be done soon -->

- [ ] Mobile layout rework (move hand/last discard/discard pile up; hide sound in settings)
- [ ] Calling phase timer (10-120 sec, auto-pass, or no timer)
- [ ] Dead wall / end-of-game draw pile (0-16 tiles)

## Medium Priority
<!-- Important but not urgent -->

- [ ] Rename calling actions (more intuitive labels)
- [ ] Rename "UPGRADE" to "KONG" in UI
- [ ] Show last action in the last discard box
- [ ] Rename default bot names (e.g., "Bot-Hard-1")
- [ ] Add delays during bonus exposure phase (expose → replace → gold flip → auto-win)
- [ ] Error boundaries for graceful failure handling
- [ ] Loading skeletons instead of "Loading..." text
- [ ] Reconnection handling for dropped connections
- [ ] Preview image for link sharing (og:image)

## Low Priority
<!-- Nice to have -->

- [ ] Manual hand sorting (drag to reorder tiles)
- [ ] Tile images instead of text/emoji
- [ ] Server-side tile drawing (instead of client-side)
- [ ] Accessibility improvements (ARIA labels, screen reader support)
- [ ] Individual sound toggles (per-sound enable/disable)
- [ ] Game history/replay feature
- [ ] Tutorial/onboarding for new players
- [ ] PWA support for "Add to Home Screen"
- [ ] Analytics to understand user behavior

## Backlog
<!-- Ideas for the future -->

- [ ] Spectator mode
- [ ] In-game chat
- [ ] Custom room settings (time limits, house rules)
- [ ] Leaderboards / player stats
- [ ] Social sharing of wins
- [ ] Multiple game variants (other Mahjong rules)

## Completed
<!-- Move items here when done -->

- [x] All One Suit bonus scoring (+60 points)
- [x] Winner celebration effects
  - Animated fireworks shooting from bottom
  - Looping victory fanfare for winner
  - Sparkle overlay effects
  - Sad emojis for losers
- [x] Player turn order UI
  - All 4 players shown in Players section
  - Current player ("You") first, others in turn order
  - Green highlight on active turn
  - Clickable rules button (modal instead of hover)
- [x] Keyboard shortcuts (customizable in Settings)
  - Draw, Win, Kong, Pung, Chow, Pass shortcuts
  - Configurable via Settings modal
- [x] Sound volume control
  - Volume slider in game header
  - Louder max volume for better audibility
- [x] Kong (Quad) implementation
  - Concealed Kong, Kong from discard, Pung upgrade
  - Replacement draw after declaration
  - Scoring: +2 concealed, +1 exposed
  - Available anytime during turn before discarding
- [x] Winner screen redesign
- [x] Sound effects
- [x] Bot difficulty selection UI
- [x] Adjustable bot difficulty logic (easy/medium/hard)
- [x] Dealer streak tracking
- [x] Vercel deployment
- [x] Firebase security rules
- [x] SEO metadata and Open Graph tags
- [x] Branding consistency (Mahjong Vibes)
- [x] Debug logging (dev-only)
- [x] Auth state feedback on homepage
- [x] Copy room code button
- [x] Basic test coverage (41 tests)
- [x] CHANGELOG.md with Keep a Changelog format
- [x] Pre-commit hooks (runs tests before commit)
- [x] `/docs-sync` skill for pre-commit documentation
- [x] `/session-wrap` skill for end-of-session documentation
- [x] Lint cleanup (46→6 warnings, 0 errors)
