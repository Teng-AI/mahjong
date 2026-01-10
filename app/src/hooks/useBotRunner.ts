'use client';

import { useEffect, useCallback } from 'react';
import { GameState, SeatIndex, TileId, TileType, Room, BotDifficulty, Meld } from '@/types';
import {
  drawTile,
  discardTile,
  submitCallResponse,
  declareSelfDrawWin,
  getPrivateHand,
  getNextSeat,
  declareConcealedKong,
  upgradePungToKong,
} from '@/lib/game';
import {
  getTileType,
  canFormWinningHand,
  canPung,
  canKong,
  canDeclareConcealedKong,
  canUpgradePungToKong,
} from '@/lib/tiles';

// ============================================
// TILE UTILITIES
// ============================================

function isGoldTile(tileId: TileId, goldType: TileType): boolean {
  return getTileType(tileId) === goldType;
}

function isHonorTile(tileId: TileId): boolean {
  const type = getTileType(tileId);
  return type.startsWith('wind_') || type.startsWith('dragon_');
}

function isTerminal(tileId: TileId): boolean {
  const type = getTileType(tileId);
  const parts = type.split('_');
  if (parts[0] === 'wind' || parts[0] === 'dragon') return false;
  const value = parseInt(parts[1]);
  return value === 1 || value === 9;
}

function isSuitTile(tileId: TileId): boolean {
  const type = getTileType(tileId);
  return type.startsWith('dots_') || type.startsWith('bamboo_') || type.startsWith('characters_');
}

// ============================================
// HAND ANALYSIS
// ============================================

interface HandAnalysis {
  tiles: TileId[];
  goldTiles: TileId[];
  regularTiles: TileId[];
  typeCounts: Map<string, number>;
  triplets: string[];
  pairs: string[];
  partials: { type: string; kind: string; tiles?: string[]; needs?: string }[];
  isolated: string[];
  discardCounts: Map<string, number>;
  goldCount: number;
}

function analyzeHand(hand: TileId[], goldType: TileType, discardPile: TileId[] = []): HandAnalysis {
  const tiles = [...hand];
  const goldTiles = tiles.filter(t => isGoldTile(t, goldType));
  const regularTiles = tiles.filter(t => !isGoldTile(t, goldType));

  // Count tiles by type
  const typeCounts = new Map<string, number>();
  for (const tile of regularTiles) {
    const type = getTileType(tile);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  // Find triplets and pairs
  const triplets: string[] = [];
  const pairs: string[] = [];
  for (const [type, count] of typeCounts) {
    if (count >= 3) triplets.push(type);
    if (count >= 2) pairs.push(type);
  }

  // Find partial sets (2 tiles that could become a set)
  const partials: { type: string; kind: string; tiles?: string[]; needs?: string }[] = [];
  for (const [type, count] of typeCounts) {
    if (count >= 2 && !triplets.includes(type)) {
      partials.push({ type, kind: 'pair-partial' });
    }

    // Check for sequence partials (suit tiles only)
    const parts = type.split('_');
    if (parts[0] !== 'wind' && parts[0] !== 'dragon') {
      const suit = parts[0];
      const val = parseInt(parts[1]);

      // Adjacent tiles
      if (val <= 8) {
        const next = `${suit}_${val + 1}`;
        if (typeCounts.has(next)) {
          partials.push({ type, kind: 'sequence', tiles: [type, next] });
        }
      }

      // Gap tiles (e.g., 3 and 5)
      if (val <= 7) {
        const skip = `${suit}_${val + 2}`;
        if (typeCounts.has(skip)) {
          partials.push({ type, kind: 'gap', tiles: [type, skip], needs: `${suit}_${val + 1}` });
        }
      }
    }
  }

  // Find isolated tiles
  const isolated: string[] = [];
  for (const [type, count] of typeCounts) {
    let hasConnection = false;
    if (count >= 2) hasConnection = true;
    if (triplets.includes(type)) hasConnection = true;

    const parts = type.split('_');
    if (parts[0] !== 'wind' && parts[0] !== 'dragon') {
      const suit = parts[0];
      const val = parseInt(parts[1]);
      if (val > 1 && typeCounts.has(`${suit}_${val - 1}`)) hasConnection = true;
      if (val < 9 && typeCounts.has(`${suit}_${val + 1}`)) hasConnection = true;
      if (val > 2 && typeCounts.has(`${suit}_${val - 2}`)) hasConnection = true;
      if (val < 8 && typeCounts.has(`${suit}_${val + 2}`)) hasConnection = true;
    }

    if (!hasConnection) {
      isolated.push(type);
    }
  }

  // Count discarded tiles
  const discardCounts = new Map<string, number>();
  for (const tile of discardPile) {
    const type = getTileType(tile);
    discardCounts.set(type, (discardCounts.get(type) || 0) + 1);
  }

  return {
    tiles,
    goldTiles,
    regularTiles,
    typeCounts,
    triplets,
    pairs,
    partials,
    isolated,
    discardCounts,
    goldCount: goldTiles.length,
  };
}

// ============================================
// DEFENSIVE PLAY HELPERS
// ============================================

interface OpponentInfo {
  seat: SeatIndex;
  meldCount: number;
  melds: Meld[];
  isNextInTurn: boolean;
  recentDiscards: TileType[];  // Last 3 discards by this player
}

function getOpponentInfo(
  gameState: GameState,
  mySeat: SeatIndex,
  _discardPile: TileId[],
  _actionLog: string[]
): OpponentInfo[] {
  const opponents: OpponentInfo[] = [];

  for (let i = 0; i < 4; i++) {
    if (i === mySeat) continue;
    const seat = i as SeatIndex;
    const seatKey = `seat${seat}` as 'seat0' | 'seat1' | 'seat2' | 'seat3';
    const melds = gameState.exposedMelds?.[seatKey] || [];

    // Get recent discards by this player from action log (simplified - just track types)
    const recentDiscards: TileType[] = [];

    opponents.push({
      seat,
      meldCount: melds.length,
      melds,
      isNextInTurn: seat === ((mySeat + 1) % 4),
      recentDiscards,
    });
  }

  return opponents;
}

// Calculate danger score for a tile (higher = more dangerous to discard)
function calculateTileDanger(
  tileId: TileId,
  opponents: OpponentInfo[],
  discardPile: TileId[],
  goldType: TileType
): number {
  const type = getTileType(tileId);
  let danger = 0;

  // Gold tiles are never dangerous to keep but risky to discard
  if (type === goldType) {
    danger += 30;
  }

  for (const opp of opponents) {
    // More danger if opponent has many melds (closer to winning)
    const meldDanger = opp.meldCount * 15;
    danger += meldDanger;

    // Check if tile could complete opponent's sequences
    for (const meld of opp.melds) {
      if (meld.type === 'chow') {
        // If opponent has a chow, same suit tiles nearby are dangerous
        const meldType = getTileType(meld.tiles[0]);
        const meldParts = meldType.split('_');
        const tileParts = type.split('_');

        if (meldParts[0] === tileParts[0] && meldParts[0] !== 'wind' && meldParts[0] !== 'dragon') {
          // Same suit - tiles in that suit are more dangerous
          danger += 5;
        }
      } else if (meld.type === 'pung') {
        // If opponent has pungs, they might be going for all pungs
        // Honor tiles become more valuable/dangerous
        if (isHonorTile(tileId)) {
          danger += 8;
        }
      }
    }
  }

  // Tiles with fewer copies remaining are more dangerous (opponent more likely to need them)
  const discardedCount = discardPile.filter(d => getTileType(d) === type).length;
  // 4 copies total - if 3 are visible, the tile is safer
  if (discardedCount >= 3) {
    danger -= 20; // Very safe - only 1 copy remains
  } else if (discardedCount >= 2) {
    danger -= 10; // Somewhat safe
  } else if (discardedCount === 0) {
    danger += 5; // No copies visible - more dangerous
  }

  return danger;
}

// Estimate if an opponent is tenpai (ready to win) - for hard mode
function isOpponentLikelyTenpai(
  opponent: OpponentInfo,
  wallRemaining: number
): boolean {
  // With 3+ melds, opponent is likely close to winning
  if (opponent.meldCount >= 3) return true;

  // With 2 melds and wall nearly empty, assume dangerous
  if (opponent.meldCount >= 2 && wallRemaining < 20) return true;

  return false;
}

// Decide whether to play defensively - for hard mode
function shouldPlayDefensively(
  opponents: OpponentInfo[],
  myShanten: number,
  wallRemaining: number
): boolean {
  // If we're close to winning, keep attacking
  if (myShanten <= 1) return false;

  // If any opponent appears tenpai and we're far from winning, defend
  const dangerousOpponents = opponents.filter(o => isOpponentLikelyTenpai(o, wallRemaining));

  if (dangerousOpponents.length > 0 && myShanten >= 3) {
    return true;
  }

  // Late game with far hand, play safe
  if (wallRemaining < 15 && myShanten >= 2) {
    return true;
  }

  return false;
}

function calculateShanten(hand: TileId[], goldType: TileType, meldCount: number = 0): number {
  const analysis = analyzeHand(hand, goldType);
  const setsNeeded = 5 - meldCount;

  // Count complete sets: triplets AND complete sequences
  let completeSets = analysis.triplets.length;

  // Count complete sequences (3 consecutive tiles of same suit)
  const usedInSequence = new Set<string>();
  for (const [type] of analysis.typeCounts) {
    if (usedInSequence.has(type)) continue;
    const parts = type.split('_');
    if (parts[0] === 'wind' || parts[0] === 'dragon') continue;

    const suit = parts[0];
    const val = parseInt(parts[1]);
    if (val <= 7) {
      const type2 = `${suit}_${val + 1}`;
      const type3 = `${suit}_${val + 2}`;
      if (analysis.typeCounts.has(type2) && analysis.typeCounts.has(type3) &&
          !usedInSequence.has(type2) && !usedInSequence.has(type3)) {
        completeSets++;
        usedInSequence.add(type);
        usedInSequence.add(type2);
        usedInSequence.add(type3);
      }
    }
  }

  const usefulPartials = Math.min(analysis.partials.length, setsNeeded - completeSets);
  const hasPair = analysis.pairs.length > 0;
  const availableGolds = analysis.goldCount;

  let shanten = (setsNeeded - completeSets) * 3 + (hasPair ? 0 : 2);
  shanten -= usefulPartials * 2;
  shanten -= availableGolds;

  return Math.max(0, Math.ceil(shanten / 2));
}

// ============================================
// STRATEGIC DECISIONS
// ============================================

// Discard selection based on difficulty level
function selectBestDiscard(
  hand: TileId[],
  goldType: TileType,
  discardPile: TileId[],
  meldCount: number = 0,
  excludeTileType?: TileType,  // Cannot discard tiles of this type (e.g., tile just called on)
  difficulty: BotDifficulty = 'medium',
  opponents: OpponentInfo[] = [],
  wallRemaining: number = 50
): TileId | null {
  const analysis = analyzeHand(hand, goldType, discardPile);
  // Filter out tiles that match the excluded type (illegal to discard tile you just called on)
  const candidates = excludeTileType
    ? analysis.regularTiles.filter(t => getTileType(t) !== excludeTileType)
    : analysis.regularTiles;

  if (candidates.length === 0) {
    return null;
  }

  // Calculate shanten for defensive decisions (hard mode)
  const myShanten = calculateShanten(hand, goldType, meldCount);
  const shouldDefend = difficulty === 'hard' && shouldPlayDefensively(opponents, myShanten, wallRemaining);

  const scores: { tile: TileId; type: string; score: number }[] = [];

  for (const tile of candidates) {
    const type = getTileType(tile);
    let score = 50;

    // ========== OFFENSIVE SCORING (all difficulties) ==========
    // Keep tiles that form triplets
    if (analysis.triplets.includes(type)) score += 100;

    // Keep pairs (especially if we have few)
    const count = analysis.typeCounts.get(type) || 0;
    if (count >= 2) {
      score += analysis.pairs.length <= 1 ? 60 : 30;
    }

    // Keep tiles in partial sequences
    const inPartial = analysis.partials.some(p => p.tiles && p.tiles.includes(type));
    if (inPartial) score += 40;

    // Discard isolated tiles first
    if (analysis.isolated.includes(type)) score -= 30;

    // Discard isolated honors/terminals first
    if (isHonorTile(tile) && count === 1) score -= 20;
    if (isTerminal(tile) && count === 1) score -= 10;

    // ========== DIFFICULTY-SPECIFIC ADJUSTMENTS ==========

    if (difficulty === 'easy') {
      // EASY: No defensive consideration - pure offensive play
      // Don't consider discard pile for "dead tiles" (remove this advantage)
      // Just play offensively
    } else if (difficulty === 'medium') {
      // MEDIUM: Basic defensive awareness
      // Consider dead tiles (tiles with 3+ already discarded are safer to hold)
      const discardCount = analysis.discardCounts.get(type) || 0;
      if (discardCount >= 3) score -= 25;  // Safe to discard (3 visible)
      else if (discardCount >= 2) score -= 15;

      // Basic danger avoidance - avoid discarding to opponents with many melds
      if (opponents.length > 0) {
        const dangerScore = calculateTileDanger(tile, opponents, discardPile, goldType);
        // Medium penalty for dangerous tiles
        score += dangerScore * 0.3;
      }
    } else if (difficulty === 'hard') {
      // HARD: Full defensive awareness
      const discardCount = analysis.discardCounts.get(type) || 0;
      if (discardCount >= 3) score -= 25;
      else if (discardCount >= 2) score -= 15;

      if (opponents.length > 0) {
        const dangerScore = calculateTileDanger(tile, opponents, discardPile, goldType);

        if (shouldDefend) {
          // In defensive mode, danger is the PRIMARY factor
          // Lower score = more likely to discard, so subtract danger
          score -= dangerScore * 0.8;  // Heavily weight safety
          // Also reduce offensive value of tiles
          score = score * 0.5;  // Reduce all offensive scores
        } else {
          // Balanced mode - consider both offense and defense
          score += dangerScore * 0.5;
        }
      }
    }

    scores.push({ tile, type, score });
  }

  scores.sort((a, b) => a.score - b.score);
  return scores[0]?.tile || null;
}

// Pung calling based on difficulty
function shouldCallPung(
  hand: TileId[],
  discardTile: TileId,
  goldType: TileType,
  meldCount: number,
  difficulty: BotDifficulty = 'medium',
  wallRemaining: number = 50
): boolean {
  const type = getTileType(discardTile);
  const matchingTiles = hand.filter(t => getTileType(t) === type && !isGoldTile(t, goldType));

  if (matchingTiles.length < 2) return false;

  const shantenBefore = calculateShanten(hand, goldType, meldCount);

  let removed = 0;
  const newHand = hand.filter(t => {
    if (removed < 2 && getTileType(t) === type && !isGoldTile(t, goldType)) {
      removed++;
      return false;
    }
    return true;
  });

  const shantenAfter = calculateShanten(newHand, goldType, meldCount + 1);

  // Difficulty-specific calling thresholds
  if (difficulty === 'easy') {
    // EASY: More aggressive calling - call if shanten stays same OR improves
    // Also call more readily in general
    return shantenAfter <= shantenBefore || (shantenAfter <= 2 && shantenBefore <= 3);
  } else if (difficulty === 'medium') {
    // MEDIUM: Standard calling - must improve OR be close to winning
    return shantenAfter < shantenBefore || (shantenAfter <= 1 && shantenBefore <= 2);
  } else {
    // HARD: Strategic calling - consider timing and hand flexibility
    // Only call if it clearly improves position
    // In late game, be more conservative
    if (wallRemaining < 20) {
      // Late game - only call if it puts us at tenpai or winning
      return shantenAfter <= 0 || (shantenAfter === 1 && shantenBefore >= 2);
    }
    // Early/mid game - standard improvement required
    return shantenAfter < shantenBefore;
  }
}

function getChowOptions(hand: TileId[], discardTile: TileId, goldType: TileType): [TileId, TileId][] {
  if (!isSuitTile(discardTile) || isGoldTile(discardTile, goldType)) {
    return [];
  }

  // Note: No hand size check - you can call as long as you have the tiles
  // This allows flexibility for Kong (which affects hand size) and edge cases

  const type = getTileType(discardTile);
  const parts = type.split('_');
  const suit = parts[0];
  const val = parseInt(parts[1]);

  const options: [TileId, TileId][] = [];

  // Discard is LOW (need val+1, val+2)
  if (val <= 7) {
    const need1 = `${suit}_${val + 1}`;
    const need2 = `${suit}_${val + 2}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  // Discard is MIDDLE (need val-1, val+1)
  if (val >= 2 && val <= 8) {
    const need1 = `${suit}_${val - 1}`;
    const need2 = `${suit}_${val + 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  // Discard is HIGH (need val-2, val-1)
  if (val >= 3) {
    const need1 = `${suit}_${val - 2}`;
    const need2 = `${suit}_${val - 1}`;
    const has1 = hand.find(t => getTileType(t) === need1 && !isGoldTile(t, goldType));
    const has2 = hand.find(t => getTileType(t) === need2 && !isGoldTile(t, goldType));
    if (has1 && has2) options.push([has1, has2]);
  }

  return options;
}

// Chow calling based on difficulty
function shouldCallChow(
  hand: TileId[],
  discardTile: TileId,
  goldType: TileType,
  meldCount: number,
  difficulty: BotDifficulty = 'medium',
  wallRemaining: number = 50
): [TileId, TileId] | null {
  const options = getChowOptions(hand, discardTile, goldType);
  if (options.length === 0) return null;

  const shantenBefore = calculateShanten(hand, goldType, meldCount);

  // Find the best chow option (one that improves shanten the most)
  let bestOption: [TileId, TileId] | null = null;
  let bestShantenAfter = Infinity;

  for (const [tile1, tile2] of options) {
    const newHand = hand.filter(t => t !== tile1 && t !== tile2);
    const shantenAfter = calculateShanten(newHand, goldType, meldCount + 1);
    if (shantenAfter < bestShantenAfter) {
      bestShantenAfter = shantenAfter;
      bestOption = [tile1, tile2];
    }
  }

  if (!bestOption) return null;

  if (DEBUG_BOT) console.log(`[Chow eval] shanten before=${shantenBefore}, after=${bestShantenAfter}, difficulty=${difficulty}, wall=${wallRemaining}`);

  // Difficulty-specific calling thresholds - made more aggressive
  if (difficulty === 'easy') {
    // EASY: Very aggressive - almost always call if we have the option
    // Call if shanten improves, stays same, or only gets slightly worse
    if (bestShantenAfter <= shantenBefore + 1) {
      return bestOption;
    }
  } else if (difficulty === 'medium') {
    // MEDIUM: Call if shanten stays same or improves
    if (bestShantenAfter <= shantenBefore) {
      return bestOption;
    }
  } else {
    // HARD: Strategic but still willing to chow
    if (wallRemaining < 20) {
      // Late game - call if improves or maintains good position
      if (bestShantenAfter <= shantenBefore && bestShantenAfter <= 2) {
        return bestOption;
      }
    } else {
      // Early/mid game - call if improves or maintains
      if (bestShantenAfter <= shantenBefore) {
        return bestOption;
      }
    }
  }

  return null;
}

// ============================================
// BOT RUNNER HOOK
// ============================================

// Debug logging - only enabled in development
const DEBUG_BOT = process.env.NODE_ENV === 'development';

interface UseBotRunnerOptions {
  roomCode: string;
  room: Room | null;
  gameState: GameState | null;
  enabled?: boolean;
  botDelay?: number; // ms delay before bot action
}

export function useBotRunner({
  roomCode,
  room,
  gameState,
  enabled = true,
  botDelay = 1000,
}: UseBotRunnerOptions) {
  // Check if a seat has a bot
  const isBotSeat = useCallback((seat: SeatIndex): boolean => {
    if (!room) return false;
    const player = room.players[`seat${seat}` as keyof typeof room.players];
    return player?.isBot === true;
  }, [room]);

  // Get bot difficulty for a seat (defaults to 'medium')
  const getBotDifficulty = useCallback((seat: SeatIndex): BotDifficulty => {
    if (!room) return 'medium';
    const player = room.players[`seat${seat}` as keyof typeof room.players];
    return player?.botDifficulty || 'medium';
  }, [room]);

  // Get list of bot seats
  const botSeats = useCallback((): SeatIndex[] => {
    const seats: SeatIndex[] = [];
    for (let i = 0; i < 4; i++) {
      if (isBotSeat(i as SeatIndex)) {
        seats.push(i as SeatIndex);
      }
    }
    return seats;
  }, [isBotSeat]);

  // Handle playing phase - bot's turn
  const handlePlayingPhase = useCallback(async (seat: SeatIndex, difficulty: BotDifficulty) => {
    const hand = await getPrivateHand(roomCode, seat);
    if (!hand) return;

    const tiles = hand.concealedTiles;
    const goldType = gameState!.goldTileType;
    const seatKey = `seat${seat}` as 'seat0' | 'seat1' | 'seat2' | 'seat3';
    const melds = gameState!.exposedMelds?.[seatKey] || [];
    const meldCount = melds.length;
    const discardPile = gameState!.discardPile || [];
    const wallRemaining = gameState!.wall?.length || 0;

    // Get opponent info for defensive play (medium/hard)
    const opponents = difficulty !== 'easy'
      ? getOpponentInfo(gameState!, seat, discardPile, gameState!.actionLog || [])
      : [];

    if (DEBUG_BOT) console.log(`[Bot ${seat}] Turn (${difficulty}) - ${tiles.length} tiles, ${meldCount} melds`);

    // Check if we need to draw
    const lastAction = gameState!.lastAction;
    const needsDraw = !lastAction ||
      lastAction.type === 'discard' ||
      lastAction.type === 'bonus_expose' ||
      lastAction.type === 'game_start' ||
      (lastAction.type === 'draw' && lastAction.playerSeat !== seat);

    // Skip draw if we just called pung/chow/kong
    const justCalled = lastAction?.type === 'pung' || lastAction?.type === 'chow' || lastAction?.type === 'kong';
    const calledBySelf = justCalled && lastAction?.playerSeat === seat;

    if (needsDraw && !calledBySelf) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Drawing tile`);
      const drawResult = await drawTile(roomCode, seat);

      if (drawResult.wallEmpty || drawResult.threeGoldsWin) {
        return; // Game ended
      }

      // Re-fetch hand after draw
      const newHand = await getPrivateHand(roomCode, seat);
      if (!newHand) return;

      const newTiles = newHand.concealedTiles;

      // Check for win after draw
      if (canFormWinningHand(newTiles, goldType, meldCount)) {
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Declaring win!`);
        await declareSelfDrawWin(roomCode, seat);
        return;
      }

      // Check for concealed kong (4 of a kind in hand)
      const concealedKongOptions = canDeclareConcealedKong(newTiles, goldType);
      if (concealedKongOptions.length > 0) {
        // Bot always declares concealed kong if available (it's usually advantageous)
        const kongType = concealedKongOptions[0];
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Declaring concealed kong: ${kongType}`);
        const kongResult = await declareConcealedKong(roomCode, seat, kongType);
        if (kongResult.success) {
          // The function handles replacement draw internally, so we're done
          return;
        }
      }

      // Check for pung upgrade (have 4th tile of an exposed pung)
      const pungUpgradeOpts = canUpgradePungToKong(newTiles, melds, goldType);
      if (pungUpgradeOpts.length > 0) {
        const opt = pungUpgradeOpts[0]; // Bot takes first available upgrade
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Upgrading pung to kong at index ${opt.meldIndex}`);
        const upgradeResult = await upgradePungToKong(roomCode, seat, opt.meldIndex, opt.tileFromHand);
        if (upgradeResult.success) {
          // The function handles replacement draw internally, so we're done
          return;
        }
      }

      // Select and make discard (with difficulty-aware logic)
      const tileToDiscard = selectBestDiscard(
        newTiles, goldType, discardPile, meldCount,
        undefined, difficulty, opponents, wallRemaining
      );

      if (tileToDiscard) {
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Discarding ${getTileType(tileToDiscard)}`);
        await discardTile(roomCode, seat, tileToDiscard);
      }
    } else {
      // Already drew (or just called) - need to discard
      // Check for win first
      if (canFormWinningHand(tiles, goldType, meldCount)) {
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Declaring win!`);
        await declareSelfDrawWin(roomCode, seat);
        return;
      }

      // Check for concealed kong (available anytime during turn before discard)
      const concealedKongOptions = canDeclareConcealedKong(tiles, goldType);
      if (concealedKongOptions.length > 0) {
        const kongType = concealedKongOptions[0];
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Declaring concealed kong: ${kongType}`);
        const kongResult = await declareConcealedKong(roomCode, seat, kongType);
        if (kongResult.success) {
          return;
        }
      }

      // Check for pung upgrade (available anytime during turn before discard)
      const pungUpgradeOpts2 = canUpgradePungToKong(tiles, melds, goldType);
      if (pungUpgradeOpts2.length > 0) {
        const opt = pungUpgradeOpts2[0]; // Bot takes first available upgrade
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Upgrading pung to kong at index ${opt.meldIndex}`);
        const upgradeResult = await upgradePungToKong(roomCode, seat, opt.meldIndex, opt.tileFromHand);
        if (upgradeResult.success) {
          return;
        }
      }

      // If we just called pung/chow/kong, we cannot discard the same tile type
      const calledTileType = (lastAction?.type === 'pung' || lastAction?.type === 'chow' || lastAction?.type === 'kong')
        ? getTileType(lastAction.tile!)
        : undefined;

      // Select discard with difficulty-aware logic
      const tileToDiscard = selectBestDiscard(
        tiles, goldType, discardPile, meldCount,
        calledTileType, difficulty, opponents, wallRemaining
      );

      if (tileToDiscard) {
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Discarding ${getTileType(tileToDiscard)}`);
        await discardTile(roomCode, seat, tileToDiscard);
      }
    }
  }, [roomCode, gameState]);

  // Handle calling phase - bot's response
  const handleCallingPhase = useCallback(async (seat: SeatIndex, difficulty: BotDifficulty) => {
    const pendingCalls = gameState!.pendingCalls;
    if (!pendingCalls) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] No pending calls, skipping`);
      return;
    }

    const myCall = pendingCalls[`seat${seat}` as keyof typeof pendingCalls];
    if (DEBUG_BOT) console.log(`[Bot ${seat}] My current call status: ${myCall}`);

    // Already responded or is discarder
    if (myCall !== null && myCall !== undefined) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Already responded with: ${myCall}, skipping`);
      return;
    }

    const hand = await getPrivateHand(roomCode, seat);
    if (!hand) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] No hand data, skipping`);
      return;
    }

    const tiles = hand.concealedTiles;
    const goldType = gameState!.goldTileType;
    const seatKey = `seat${seat}` as 'seat0' | 'seat1' | 'seat2' | 'seat3';
    const melds = gameState!.exposedMelds?.[seatKey] || [];
    const meldCount = melds.length;
    const discardTileId = gameState!.lastAction?.tile;
    const discarderSeat = gameState!.lastAction?.playerSeat;
    const wallRemaining = gameState!.wall?.length || 0;

    if (!discardTileId || discarderSeat === undefined) return;

    if (DEBUG_BOT) console.log(`[Bot ${seat}] Responding to discard ${getTileType(discardTileId)} (${difficulty})`);

    // Check for win - always take wins regardless of difficulty
    const testHand = [...tiles, discardTileId];
    if (canFormWinningHand(testHand, goldType, meldCount)) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Calling WIN!`);
      await submitCallResponse(roomCode, seat, 'win');
      return;
    }

    // Check for kong (3 in hand + discard = 4)
    // Kong is strictly better than pung, so check and call it first
    if (canKong(tiles, discardTileId, goldType)) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Calling KONG!`);
      const result = await submitCallResponse(roomCode, seat, 'kong');
      if (!result.success) {
        if (DEBUG_BOT) console.error(`[Bot ${seat}] Kong failed: ${result.error}, falling back to pass`);
        await submitCallResponse(roomCode, seat, 'pass');
      }
      return;
    }

    // Check for pung (with difficulty-aware logic)
    if (canPung(tiles, discardTileId, goldType, meldCount) &&
        shouldCallPung(tiles, discardTileId, goldType, meldCount, difficulty, wallRemaining)) {
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Calling PUNG!`);
      const result = await submitCallResponse(roomCode, seat, 'pung');
      if (!result.success) {
        if (DEBUG_BOT) console.error(`[Bot ${seat}] Pung failed: ${result.error}, falling back to pass`);
        await submitCallResponse(roomCode, seat, 'pass');
      }
      return;
    }

    // Check for chow (only if next in turn, with difficulty-aware logic)
    const isNextInTurn = seat === getNextSeat(discarderSeat);
    if (DEBUG_BOT) console.log(`[Bot ${seat}] Next in turn check: seat=${seat}, discarder=${discarderSeat}, nextSeat=${getNextSeat(discarderSeat)}, isNext=${isNextInTurn}`);
    if (isNextInTurn) {
      const chowOptions = getChowOptions(tiles, discardTileId, goldType);
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Chow options available: ${chowOptions.length}`);
      const chowTiles = shouldCallChow(tiles, discardTileId, goldType, meldCount, difficulty, wallRemaining);
      if (DEBUG_BOT) console.log(`[Bot ${seat}] Should call chow: ${chowTiles ? 'yes' : 'no'}`);
      if (chowTiles) {
        if (DEBUG_BOT) console.log(`[Bot ${seat}] Calling CHOW!`);
        const result = await submitCallResponse(roomCode, seat, 'chow', chowTiles);
        if (!result.success) {
          if (DEBUG_BOT) console.error(`[Bot ${seat}] Chow failed: ${result.error}, falling back to pass`);
          await submitCallResponse(roomCode, seat, 'pass');
        }
        return;
      }
    }

    // Pass
    if (DEBUG_BOT) console.log(`[Bot ${seat}] Passing`);
    await submitCallResponse(roomCode, seat, 'pass');
  }, [roomCode, gameState]);

  // Main effect - watch game state and run bot actions
  // Uses effect cleanup to cancel pending actions when state changes
  useEffect(() => {
    if (!enabled || !gameState || !room) return;
    if (gameState.phase === 'ended' || gameState.phase === 'waiting') return;

    const bots = botSeats();
    if (bots.length === 0) return;

    const currentSeat = gameState.currentPlayerSeat;
    const isCurrentPlayerBot = isBotSeat(currentSeat);

    // Track if this effect instance is still valid (not cleaned up)
    let cancelled = false;

    // For playing phase: only proceed if current player is a bot
    if (gameState.phase === 'playing' && !isCurrentPlayerBot) {
      return;
    }

    // For calling: check if any bot still needs to respond
    if (gameState.phase === 'calling') {
      const pendingCalls = gameState.pendingCalls;
      if (!pendingCalls) return;

      const botsNeedingResponse = bots.filter(seat => {
        const callStatus = pendingCalls[`seat${seat}` as keyof typeof pendingCalls];
        return callStatus === null || callStatus === undefined;
      });

      if (botsNeedingResponse.length === 0) {
        return;
      }
    }

    const runBotActions = async () => {
      // Small delay for natural feel
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelled) return;

      try {
        // Handle playing phase
        if (gameState.phase === 'playing' && isCurrentPlayerBot) {
          const difficulty = getBotDifficulty(currentSeat);
          await handlePlayingPhase(currentSeat, difficulty);
          return;
        }

        // Handle calling phase - all bots respond
        if (gameState.phase === 'calling') {
          for (const seat of bots) {
            if (cancelled) return;
            const myCall = gameState.pendingCalls?.[`seat${seat}` as keyof typeof gameState.pendingCalls];
            if (myCall === null || myCall === undefined) {
              const difficulty = getBotDifficulty(seat);
              await handleCallingPhase(seat, difficulty);
              // Small delay between bots
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }
      } catch (err) {
        if (DEBUG_BOT) console.error('[Bot] Action failed:', err);
      }
    };

    runBotActions();

    // Cleanup: mark this effect instance as cancelled
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    gameState,
    room,
    botSeats,
    isBotSeat,
    getBotDifficulty,
    botDelay,
    handlePlayingPhase,
    handleCallingPhase,
  ]);

  return {
    botSeats: botSeats(),
    isBotSeat,
  };
}
