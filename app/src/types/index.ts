// ============================================
// TILE TYPES
// ============================================

/** Unique identifier for a specific tile instance (e.g., "dots_5_2") */
export type TileId = string;

/** Tile type without instance number (e.g., "dots_5", "wind_east") */
export type TileType = string;

/** Suit categories */
export type Suit = 'dots' | 'bamboo' | 'characters';

/** Wind directions */
export type WindDirection = 'east' | 'south' | 'west' | 'north';

/** Tile categories */
export type TileCategory = 'suit' | 'wind' | 'dragon' | 'bonus';

// ============================================
// MELD TYPES
// ============================================

/** Types of melds */
export type MeldType = 'chow' | 'pung' | 'kong';

/** A meld (exposed set of tiles) */
export interface Meld {
  type: MeldType;
  tiles: TileId[];
  /** Which tile was taken from discard (if any) */
  calledTile?: TileId;
  /** For Kong: whether it's concealed (all 4 from hand) or exposed */
  isConcealed?: boolean;
}

// ============================================
// PLAYER TYPES
// ============================================

/** Seat positions (0-3, counter-clockwise from East) */
export type SeatIndex = 0 | 1 | 2 | 3;

/** Bot difficulty levels */
export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Player in a room (before game starts) */
export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  lastSeen: number;
  isBot?: boolean;  // True if this is an AI bot player
  botDifficulty?: BotDifficulty;  // Difficulty level for bot players
}

/** Player state during game */
export interface PlayerState {
  concealedTiles: TileId[];
  exposedMelds: Meld[];
  bonusTiles: TileId[];
}

// ============================================
// CALL TYPES
// ============================================

/** Possible call actions */
export type CallAction = 'win' | 'kong' | 'pung' | 'chow' | 'pass';

/** Call state for a player */
export type PendingCall = CallAction | 'discarder' | null;

/** All pending calls during calling phase */
export interface PendingCalls {
  seat0: PendingCall;
  seat1: PendingCall;
  seat2: PendingCall;
  seat3: PendingCall;
}

/** Chow option - which 2 tiles from hand form sequence with discard */
export interface ChowOption {
  tilesFromHand: [TileId, TileId];
  sequence: [TileType, TileType, TileType]; // The complete sequence types (sorted)
}

// ============================================
// GAME STATE TYPES
// ============================================

/** Game phases */
export type GamePhase =
  | 'waiting'          // Waiting for players
  | 'setup'            // Dealing tiles
  | 'bonus_exposure'   // Players exposing bonus tiles
  | 'playing'          // Normal gameplay
  | 'calling'          // Waiting for call responses after discard
  | 'ended';           // Game over

/** Last action taken in the game */
export interface LastAction {
  type: 'discard' | 'draw' | 'pung' | 'chow' | 'kong' | 'win' | 'bonus_expose' | 'game_start';
  playerSeat: SeatIndex;
  tile?: TileId;
  replacementTile?: TileId; // For kong: the tile drawn after declaring kong
  timestamp: number;
}

/** Winner information */
export interface WinnerInfo {
  seat: SeatIndex;
  isSelfDraw: boolean;
  isThreeGolds: boolean;
  isRobbingGold: boolean; // Won by claiming the flipped Gold tile at game start
  winningTile?: TileId; // The tile that completed the hand (for discard wins)
  discarderSeat?: SeatIndex; // Who discarded the winning tile
  hand: TileId[];
  score: ScoreBreakdown;
}

/** Score calculation breakdown */
export interface ScoreBreakdown {
  base: number;
  bonusTiles: number;
  golds: number;
  concealedKongBonus: number; // +2 per concealed kong
  exposedKongBonus: number; // +1 per exposed kong
  dealerStreakBonus: number; // +1 per consecutive dealer win (0 for first win)
  subtotal: number;
  multiplier: number;
  // Special bonuses (added after multiplier, don't stack with self-draw)
  threeGoldsBonus?: number; // Three Golds instant win (+20)
  robbingGoldBonus?: number; // Robbing the Gold at game start (+20)
  goldenPairBonus?: number; // Winning pair is 2 Gold tiles (+30)
  noBonusBonus?: number; // No exposed bonus tiles (+10)
  allOneSuitBonus?: number; // All tiles same suit (+60, gold counts as same suit)
  total: number;
}

/**
 * Main game state
 *
 * FUJIAN MAHJONG TILE COUNTS:
 * - 108 suited tiles (3 suits × 9 values × 4 copies)
 * - 16 wind tiles (4 winds × 4 copies)
 * - 4 red dragon tiles
 * = 128 tiles total (NO flowers/seasons)
 *
 * DEALING:
 * - Dealer (East): 17 tiles
 * - Others: 16 tiles each
 * - Wall after dealing: 63 tiles
 */
export interface GameState {
  phase: GamePhase;
  /** The tile TYPE that is Gold (e.g., "dots_1") - used for matching */
  goldTileType: TileType;
  /** The specific tile INSTANCE revealed as Gold (e.g., "dots_1_0") - used for display */
  exposedGold: TileId;
  wall: TileId[];
  discardPile: TileId[];
  currentPlayerSeat: SeatIndex;
  dealerSeat: SeatIndex;
  lastAction: LastAction | null;
  exposedMelds: {
    seat0: Meld[];
    seat1: Meld[];
    seat2: Meld[];
    seat3: Meld[];
  };
  bonusTiles: {
    seat0: TileId[];
    seat1: TileId[];
    seat2: TileId[];
    seat3: TileId[];
  };
  pendingCalls: PendingCalls | null;
  pendingChowOption?: ChowOption; // Temporarily stores chosen chow option during calling
  winner: WinnerInfo | null;
  actionLog: string[];
}

/** Private hand (only visible to owner) */
export interface PrivateHand {
  concealedTiles: TileId[];
}

// ============================================
// ROOM TYPES
// ============================================

/** Room status */
export type RoomStatus = 'waiting' | 'playing' | 'ended';

/** Room settings */
export interface RoomSettings {
  dealerSeat: SeatIndex;
}

/** Room data structure */
export interface Room {
  roomCode: string;
  hostId: string;
  createdAt: number;
  status: RoomStatus;
  players: {
    seat0: RoomPlayer | null;
    seat1: RoomPlayer | null;
    seat2: RoomPlayer | null;
    seat3: RoomPlayer | null;
  };
  settings: RoomSettings;
  game?: GameState;
  session?: SessionScores;
}

// ============================================
// SESSION/SCORING TYPES
// ============================================

/** A completed game round result */
export interface GameRound {
  roundNumber: number;
  winnerSeat: SeatIndex | null;  // null for draw games
  winnerName: string;
  score: number;                  // Points won this round (0 for draws)
  dealerSeat: SeatIndex;          // Who was dealer this round
  timestamp: number;
}

/** Cumulative session scores across multiple rounds */
export interface SessionScores {
  rounds: GameRound[];
  cumulative: {
    seat0: number;
    seat1: number;
    seat2: number;
    seat3: number;
  };
  dealerStreak: number; // Consecutive wins by current dealer (0 = no streak)
}

/** Settlement transaction */
export interface Settlement {
  from: SeatIndex;
  to: SeatIndex;
  amount: number;
}

// ============================================
// UTILITY TYPES
// ============================================

/** Valid call options for a player */
export interface ValidCalls {
  canWin: boolean;
  canKong: boolean;
  canPung: boolean;
  canChow: boolean;
}

/** Tile parsing result */
export interface ParsedTile {
  category: TileCategory;
  suit?: Suit;
  value: number | WindDirection | string;
  instance: number;
}
