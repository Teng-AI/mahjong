'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { GameState, SeatIndex, TileId, TileType, Room } from '@/types';
import {
  drawTile,
  discardTile,
  exposeBonusTiles,
  advanceBonusExposure,
  submitCallResponse,
  declareSelfDrawWin,
  getPrivateHand,
  getNextSeat,
} from '@/lib/game';
import {
  getTileType,
  canFormWinningHand,
  canPung,
  isBonusTile,
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

function calculateShanten(hand: TileId[], goldType: TileType, meldCount: number = 0): number {
  const analysis = analyzeHand(hand, goldType);
  const setsNeeded = 5 - meldCount;

  // Count complete sets: triplets AND complete sequences
  let completeSets = analysis.triplets.length;

  // Count complete sequences (3 consecutive tiles of same suit)
  const usedInSequence = new Set<string>();
  for (const [type, count] of analysis.typeCounts) {
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

  let usefulPartials = Math.min(analysis.partials.length, setsNeeded - completeSets);
  let hasPair = analysis.pairs.length > 0;
  let availableGolds = analysis.goldCount;

  let shanten = (setsNeeded - completeSets) * 3 + (hasPair ? 0 : 2);
  shanten -= usefulPartials * 2;
  shanten -= availableGolds;

  return Math.max(0, Math.ceil(shanten / 2));
}

// ============================================
// STRATEGIC DECISIONS
// ============================================

function selectBestDiscard(hand: TileId[], goldType: TileType, discardPile: TileId[], _meldCount: number = 0): TileId | null {
  const analysis = analyzeHand(hand, goldType, discardPile);
  const candidates = analysis.regularTiles;

  if (candidates.length === 0) {
    return null;
  }

  const scores: { tile: TileId; type: string; score: number }[] = [];

  for (const tile of candidates) {
    const type = getTileType(tile);
    let score = 50;

    if (analysis.triplets.includes(type)) score += 100;

    const count = analysis.typeCounts.get(type) || 0;
    if (count >= 2) {
      score += analysis.pairs.length <= 1 ? 60 : 30;
    }

    const inPartial = analysis.partials.some(p => p.tiles && p.tiles.includes(type));
    if (inPartial) score += 40;
    if (analysis.isolated.includes(type)) score -= 30;
    if (isHonorTile(tile) && count === 1) score -= 20;
    if (isTerminal(tile) && count === 1) score -= 10;

    const discardCount = analysis.discardCounts.get(type) || 0;
    if (discardCount >= 3) score -= 25;
    else if (discardCount >= 2) score -= 15;

    scores.push({ tile, type, score });
  }

  scores.sort((a, b) => a.score - b.score);
  return scores[0]?.tile || null;
}

function shouldCallPung(hand: TileId[], discardTile: TileId, goldType: TileType, meldCount: number): boolean {
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

  return shantenAfter < shantenBefore || (shantenAfter <= 1 && shantenBefore <= 2);
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

function shouldCallChow(hand: TileId[], discardTile: TileId, goldType: TileType, meldCount: number): [TileId, TileId] | null {
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

  // Use same criteria as pung: call if shanten improves OR if already close to ready
  // This makes chow equally viable as pung for building hands
  if (bestShantenAfter < shantenBefore || (bestShantenAfter <= 1 && shantenBefore <= 2)) {
    return bestOption;
  }

  return null;
}

// ============================================
// BOT RUNNER HOOK
// ============================================

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
  const processingRef = useRef(false);
  const lastActionRef = useRef<string | null>(null);
  const [recheckTrigger, setRecheckTrigger] = useState(0);

  // Check if a seat has a bot
  const isBotSeat = useCallback((seat: SeatIndex): boolean => {
    if (!room) return false;
    const player = room.players[`seat${seat}` as keyof typeof room.players];
    return player?.isBot === true;
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

  // Run bot action with delay
  const runBotAction = useCallback(async (action: () => Promise<void>) => {
    if (processingRef.current) return;
    processingRef.current = true;

    await new Promise(resolve => setTimeout(resolve, botDelay));

    try {
      await action();
    } catch (err) {
      console.error('Bot action failed:', err);
    } finally {
      processingRef.current = false;
      // Reset action signature and trigger recheck
      // This handles the case where gameState updated while we were processing
      lastActionRef.current = null;
      setRecheckTrigger(prev => prev + 1);
    }
  }, [botDelay]);

  // Handle bonus exposure phase
  const handleBonusPhase = useCallback(async (seat: SeatIndex) => {
    console.log(`[Bot ${seat}] Handling bonus exposure`);

    const result = await exposeBonusTiles(roomCode, seat);
    if (result.success) {
      await advanceBonusExposure(roomCode, seat, gameState!.dealerSeat);
    }
  }, [roomCode, gameState]);

  // Handle playing phase - bot's turn
  const handlePlayingPhase = useCallback(async (seat: SeatIndex) => {
    const hand = await getPrivateHand(roomCode, seat);
    if (!hand) return;

    const tiles = hand.concealedTiles;
    const goldType = gameState!.goldTileType;
    const seatKey = `seat${seat}` as 'seat0' | 'seat1' | 'seat2' | 'seat3';
    const melds = gameState!.exposedMelds?.[seatKey] || [];
    const meldCount = melds.length;

    console.log(`[Bot ${seat}] Turn - ${tiles.length} tiles, ${meldCount} melds`);

    // Check if we need to draw
    const lastAction = gameState!.lastAction;
    const needsDraw = !lastAction ||
      lastAction.type === 'discard' ||
      lastAction.type === 'bonus_expose' ||
      lastAction.type === 'game_start' ||
      (lastAction.type === 'draw' && lastAction.playerSeat !== seat);

    // Skip draw if we just called pung/chow
    const justCalled = lastAction?.type === 'pung' || lastAction?.type === 'chow';
    const calledBySelf = justCalled && lastAction?.playerSeat === seat;

    if (needsDraw && !calledBySelf) {
      console.log(`[Bot ${seat}] Drawing tile`);
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
        console.log(`[Bot ${seat}] Declaring win!`);
        await declareSelfDrawWin(roomCode, seat);
        return;
      }

      // Select and make discard
      const discardPile = gameState!.discardPile || [];
      const tileToDiscard = selectBestDiscard(newTiles, goldType, discardPile, meldCount);

      if (tileToDiscard) {
        console.log(`[Bot ${seat}] Discarding ${getTileType(tileToDiscard)}`);
        await discardTile(roomCode, seat, tileToDiscard);
      }
    } else {
      // Already drew (or just called) - need to discard
      // Check for win first
      if (canFormWinningHand(tiles, goldType, meldCount)) {
        console.log(`[Bot ${seat}] Declaring win!`);
        await declareSelfDrawWin(roomCode, seat);
        return;
      }

      const discardPile = gameState!.discardPile || [];
      const tileToDiscard = selectBestDiscard(tiles, goldType, discardPile, meldCount);

      if (tileToDiscard) {
        console.log(`[Bot ${seat}] Discarding ${getTileType(tileToDiscard)}`);
        await discardTile(roomCode, seat, tileToDiscard);
      }
    }
  }, [roomCode, gameState]);

  // Handle calling phase - bot's response
  const handleCallingPhase = useCallback(async (seat: SeatIndex) => {
    const pendingCalls = gameState!.pendingCalls;
    if (!pendingCalls) return;

    const myCall = pendingCalls[`seat${seat}` as keyof typeof pendingCalls];

    // Already responded or is discarder
    if (myCall !== null && myCall !== undefined) return;

    const hand = await getPrivateHand(roomCode, seat);
    if (!hand) return;

    const tiles = hand.concealedTiles;
    const goldType = gameState!.goldTileType;
    const seatKey = `seat${seat}` as 'seat0' | 'seat1' | 'seat2' | 'seat3';
    const melds = gameState!.exposedMelds?.[seatKey] || [];
    const meldCount = melds.length;
    const discardTileId = gameState!.lastAction?.tile;
    const discarderSeat = gameState!.lastAction?.playerSeat;

    if (!discardTileId || discarderSeat === undefined) return;

    console.log(`[Bot ${seat}] Responding to discard ${getTileType(discardTileId)}`);

    // Check for win
    const testHand = [...tiles, discardTileId];
    if (canFormWinningHand(testHand, goldType, meldCount)) {
      console.log(`[Bot ${seat}] Calling WIN!`);
      await submitCallResponse(roomCode, seat, 'win');
      return;
    }

    // Check for pung
    if (canPung(tiles, discardTileId, goldType, meldCount) && shouldCallPung(tiles, discardTileId, goldType, meldCount)) {
      console.log(`[Bot ${seat}] Calling PUNG!`);
      const result = await submitCallResponse(roomCode, seat, 'pung');
      if (!result.success) {
        console.error(`[Bot ${seat}] Pung failed: ${result.error}, falling back to pass`);
        await submitCallResponse(roomCode, seat, 'pass');
      }
      return;
    }

    // Check for chow (only if next in turn)
    const isNextInTurn = seat === getNextSeat(discarderSeat);
    if (isNextInTurn) {
      const chowTiles = shouldCallChow(tiles, discardTileId, goldType, meldCount);
      if (chowTiles) {
        console.log(`[Bot ${seat}] Calling CHOW!`);
        const result = await submitCallResponse(roomCode, seat, 'chow', chowTiles);
        if (!result.success) {
          console.error(`[Bot ${seat}] Chow failed: ${result.error}, falling back to pass`);
          await submitCallResponse(roomCode, seat, 'pass');
        }
        return;
      }
    }

    // Pass
    console.log(`[Bot ${seat}] Passing`);
    await submitCallResponse(roomCode, seat, 'pass');
  }, [roomCode, gameState]);

  // Main effect - watch game state and run bot actions
  useEffect(() => {
    if (!enabled || !gameState || !room) return;
    if (gameState.phase === 'ended' || gameState.phase === 'waiting') return;

    const bots = botSeats();
    if (bots.length === 0) return;

    // Create action signature to prevent duplicate actions
    const actionSig = `${gameState.phase}-${gameState.currentPlayerSeat}-${gameState.lastAction?.timestamp || 0}-${JSON.stringify(gameState.pendingCalls)}`;
    if (actionSig === lastActionRef.current) return;
    lastActionRef.current = actionSig;

    const runBotActions = async () => {
      // Handle bonus exposure phase
      if (gameState.phase === 'bonus_exposure') {
        const currentSeat = gameState.currentPlayerSeat;
        if (isBotSeat(currentSeat)) {
          await runBotAction(() => handleBonusPhase(currentSeat));
        }
        return;
      }

      // Handle playing phase
      if (gameState.phase === 'playing') {
        const currentSeat = gameState.currentPlayerSeat;
        if (isBotSeat(currentSeat)) {
          await runBotAction(() => handlePlayingPhase(currentSeat));
        }
        return;
      }

      // Handle calling phase - all bots need to respond
      if (gameState.phase === 'calling') {
        for (const seat of bots) {
          const myCall = gameState.pendingCalls?.[`seat${seat}` as keyof typeof gameState.pendingCalls];
          if (myCall === null || myCall === undefined) {
            await runBotAction(() => handleCallingPhase(seat));
          }
        }
      }
    };

    runBotActions();
  }, [
    enabled,
    gameState,
    room,
    botSeats,
    isBotSeat,
    runBotAction,
    handleBonusPhase,
    handlePlayingPhase,
    handleCallingPhase,
    recheckTrigger, // Re-run effect after bot action completes
  ]);

  return {
    botSeats: botSeats(),
    isBotSeat,
  };
}
