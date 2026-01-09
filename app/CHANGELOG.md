# Changelog

All notable changes to Mahjong Vibes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Copy room code button in lobby
- Auth state feedback on homepage (loading spinner, error message)
- Basic test coverage (41 tests for core game logic)
- Conditional debug logging (development only)

### Changed
- Branding updated to "Mahjong Vibes" throughout

### Fixed
- Console.log statements no longer appear in production

## [1.0.0] - 2026-01-09

### Added
- Multiplayer Fujian Mahjong (Gold Rush Mahjong) gameplay
- Real-time game state sync with Firebase
- Bot AI with 3 difficulty levels (easy, medium, hard)
- Room creation and joining with 6-character codes
- Pung and Chow calling system
- Win detection with Gold tile wildcards
- Golden Pair bonus scoring (+30 points)
- Three Golds instant win condition
- Dealer streak tracking and bonus
- Sound effects for game actions
- Winner screen with score breakdown
- Mobile-responsive design
- SEO metadata and Open Graph tags
- Firebase security rules
- Vercel deployment with auto-deploy

### Technical
- Next.js 16 with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Firebase Realtime Database for game state
- Firebase Anonymous Auth for players
