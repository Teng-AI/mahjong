# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

## In Progress
<!-- Currently being worked on -->

## High Priority
<!-- Should be done soon -->

## Medium Priority
<!-- Important but not urgent -->

- [ ] Error boundaries for graceful failure handling
- [ ] Loading skeletons instead of "Loading..." text
- [ ] Reconnection handling for dropped connections
- [ ] Mobile touch optimization (larger tap targets)
- [ ] Preview image for link sharing (og:image)

## Low Priority
<!-- Nice to have -->

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
