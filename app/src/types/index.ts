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
export type TileCategory = 'suit' | 'wind' | 'dragon';

// ============================================
// MELD TYPES
// ============================================

/** Types of melds (MVP: no kong) */
export type MeldType = 'chow' | 'pung';

/** A meld (exposed set of tiles) */
export interface Meld {
  type: MeldType;
  tiles: TileId[];
  /** Which tile was taken from discard (if any) */
  calledTile?: TileId;
}

// ============================================
// PLAYER TYPES
// ============================================

/** Seat positions (0-3, counter-clockwise from East) */
export type SeatIndex = 0 | 1 | 2 | 3;

/** Player in a room (before game starts) */
export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  lastSeen: number;
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
export type CallAction = 'win' | 'pung' | 'chow' | 'pass';

/** Call state for a player */
export type PendingCall = CallAction | 'discarder' | null;

/** All pending calls during calling phase */
export interface PendingCalls {
  seat0: PendingCall;
  seat1: PendingCall;
  seat2: PendingCall;
  seat3: PendingCall;
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
  type: 'discard' | 'draw' | 'pung' | 'chow' | 'win' | 'bonus_expose';
  playerSeat: SeatIndex;
  tile?: TileId;
  timestamp: number;
}

/** Winner information */
export interface WinnerInfo {
  seat: SeatIndex;
  isSelfDraw: boolean;
  isThreeGolds: boolean;
  hand: TileId[];
  score: ScoreBreakdown;
}

/** Score calculation breakdown */
export interface ScoreBreakdown {
  base: number;
  bonusTiles: number;
  golds: number;
  subtotal: number;
  multiplier: number;
  threeGoldsBonus: number;
  total: number;
}

/** Main game state */
export interface GameState {
  phase: GamePhase;
  goldTileType: TileType;
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
}

// ============================================
// UTILITY TYPES
// ============================================

/** Valid call options for a player */
export interface ValidCalls {
  canWin: boolean;
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
