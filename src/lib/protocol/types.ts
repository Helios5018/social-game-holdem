export type CardSuit = "spades" | "hearts" | "diamonds" | "clubs";
export type CardRank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "settled";

export interface Card {
  rank: CardRank;
  suit: CardSuit;
}

export type GameActionType =
  | "FOLD"
  | "CHECK"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN";

export interface GameActionCommand {
  actionId: string;
  type: GameActionType;
  amount?: number;
}

export interface AllowedActions {
  fold: boolean;
  check: boolean;
  call: boolean;
  bet: boolean;
  raise: boolean;
  allIn: boolean;
  toCall: number;
  minBet: number;
  minRaiseTo: number;
  maxPut: number;
}

export interface PlayerPublicState {
  playerId: string;
  displayName: string;
  seatNo: number;
  stack: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  streetContribution: number;
  contribution: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
}

export interface PlayerPrivateState {
  holeCards: Card[];
  allowedActions: AllowedActions | null;
}

export interface HandResult {
  winnerPlayerIds: string[];
  amount: number;
  reason: string;
}

export interface PotBreakdownItem {
  potId: string;
  kind: "main" | "side";
  amount: number;
  eligiblePlayerIds: string[];
  level: number;
}

export interface RoomSnapshot {
  roomCode: string;
  smallBlind: number;
  bigBlind: number;
  status: "waiting" | "in_hand";
  version: number;
  handNo: number;
  street: Street | null;
  pot: number;
  pots: PotBreakdownItem[];
  hasSidePot: boolean;
  minRaise: number;
  currentBet: number;
  dealerSeat: number | null;
  communityCards: Card[];
  players: PlayerPublicState[];
  actionLog: string[];
  results: HandResult[];
  yourPlayerId: string | null;
  yourPrivateState: PlayerPrivateState | null;
}

export interface CreateRoomRequest {
  hostDisplayName: string;
  smallBlind: number;
  bigBlind: number;
}

export interface CreateRoomResponse {
  roomCode: string;
  hostToken: string;
  roomId: string;
}

export interface JoinRoomRequest {
  playerDisplayName: string;
}

export interface JoinRoomResponse {
  roomCode: string;
  playerId: string;
  playerToken: string;
  availableSeats: number[];
}

export interface SeatRequest {
  token: string;
  seatNo: number;
  buyIn: number;
}

export interface StartHandRequest {
  token: string;
}

export interface PlayerActionRequest {
  token: string;
  command: GameActionCommand;
}
