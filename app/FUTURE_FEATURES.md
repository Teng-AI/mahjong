# Roadmap

> **Keeping this updated:** Review this file at the start and end of each work session. Mark items `[x]` when done, add new ideas as they come up, and move items between sections as priorities change.

## In Progress
<!-- Currently being worked on -->

## High Priority
<!-- Should be done soon -->

- [ ] Kong (Quad) implementation
  - Allow players to declare Kong (4 of the same tile)
  - Concealed Kong vs Exposed Kong
  - Draw replacement tile from back of wall
  - Affects hand structure (still need 5 sets + 1 pair, but Kong counts as 1 set)

## Medium Priority
<!-- Important but not urgent -->

- [ ] Lint cleanup (46 issues: 13 errors, 33 warnings)
- [ ] Error boundaries for graceful failure handling
- [ ] Loading skeletons instead of "Loading..." text
- [ ] Reconnection handling for dropped connections
- [ ] Mobile touch optimization (larger tap targets)
- [ ] Keyboard shortcuts for common actions (D=draw, spacebar=discard selected)
- [ ] Preview image for link sharing (og:image)

## Low Priority
<!-- Nice to have -->

- [ ] Accessibility improvements (ARIA labels, screen reader support)
- [ ] Sound settings (volume control, individual sound toggles)
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
