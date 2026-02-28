import type { Card, HandResult, ShowdownDetail, Street } from "@/lib/protocol/types";

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  seatNo: number | null;
  stack: number;
  connectedAt: number;
  lastSeenAt: number;
}

export interface HandState {
  handNo: number;
  street: Street;
  deck: Card[];
  communityCards: Card[];
  holeCards: Record<string, [Card, Card]>;
  activePlayerIds: string[];
  folded: Set<string>;
  allIn: Set<string>;
  contributionsTotal: Record<string, number>;
  contributionsStreet: Record<string, number>;
  currentBet: number;
  minRaise: number;
  toActPlayerId: string | null;
  acted: Set<string>;
  smallBlindSeat: number;
  bigBlindSeat: number;
  /** Tracks processed actionIds to prevent duplicate submissions within a hand. */
  processedActionIds: Set<string>;
}

export interface RoomState {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  smallBlind: number;
  bigBlind: number;
  seats: Array<string | null>;
  players: Record<string, RoomPlayer>;
  dealerSeat: number | null;
  status: "waiting" | "in_hand";
  handNo: number;
  hand: HandState | null;
  version: number;
  actionLog: string[];
  results: HandResult[];
  lastShowdown: ShowdownDetail | null;
}
