import crypto from "node:crypto";
import {
  type AllowedActions,
  type Card,
  type CardRank,
  type CardSuit,
  type GameActionCommand,
  type HandResult,
  type PotBreakdownItem,
  type PlayerPrivateState,
  type PlayerPublicState,
  type RoomSnapshot,
  type Street,
} from "@/lib/protocol/types";
import { createToken, type AuthRole, type TokenPayload, verifyToken } from "./auth";

interface RoomPlayer {
  playerId: string;
  displayName: string;
  seatNo: number | null;
  stack: number;
  connectedAt: number;
}

interface HandState {
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
}

interface RoomState {
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
}

interface DecodedIdentity {
  payload: TokenPayload;
  token: string;
}

interface DealOutcome {
  amount: number;
  isAllIn: boolean;
}

const RANKS: CardRank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];
const SUITS: CardSuit[] = ["spades", "hearts", "diamonds", "clubs"];
const TABLE_SEATS = 9;
const MAX_LOGS = 30;
const MIN_BUY_IN = 100;
const MAX_BUY_IN = 20000;
const BET_STEP = 5;

type HandRank = {
  category: number;
  kickers: number[];
  label: string;
};

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function now(): number {
  return Date.now();
}

function rankToValue(rank: CardRank): number {
  switch (rank) {
    case "A":
      return 14;
    case "K":
      return 13;
    case "Q":
      return 12;
    case "J":
      return 11;
    default:
      return Number(rank);
  }
}

function generateRoomCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function clampBuyIn(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_BUY_IN;
  }

  return Math.max(MIN_BUY_IN, Math.min(MAX_BUY_IN, Math.floor(value)));
}

function shuffleDeck(deck: Card[]): Card[] {
  const clone = [...deck];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swap]] = [clone[swap], clone[index]];
  }

  return clone;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }

  return shuffleDeck(deck);
}

function combinations<T>(items: T[], count: number): T[][] {
  if (count === 0) {
    return [[]];
  }

  if (items.length < count) {
    return [];
  }

  if (items.length === count) {
    return [items.slice()];
  }

  const [head, ...tail] = items;
  const withHead = combinations(tail, count - 1).map((combo) => [head, ...combo]);
  const withoutHead = combinations(tail, count);
  return [...withHead, ...withoutHead];
}

function compareKickers(left: number[], right: number[]): number {
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const lv = left[index] ?? 0;
    const rv = right[index] ?? 0;
    if (lv !== rv) {
      return lv > rv ? 1 : -1;
    }
  }

  return 0;
}

function compareHandRank(left: HandRank, right: HandRank): number {
  if (left.category !== right.category) {
    return left.category > right.category ? 1 : -1;
  }

  return compareKickers(left.kickers, right.kickers);
}

function evaluateFive(cards: Card[]): HandRank {
  const values = cards.map((card) => rankToValue(card.rank)).sort((a, b) => b - a);
  const suits = cards.map((card) => card.suit);
  const isFlush = suits.every((suit) => suit === suits[0]);

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  const wheel = [14, 5, 4, 3, 2];

  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      straightHigh = unique[0];
    } else if (unique.join(",") === wheel.join(",")) {
      straightHigh = 5;
    }
  }

  const grouped = Array.from(counts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }

    return b[0] - a[0];
  });

  if (isFlush && straightHigh > 0) {
    return {
      category: 8,
      kickers: [straightHigh],
      label: straightHigh === 14 ? "Royal Flush" : "Straight Flush",
    };
  }

  if (grouped[0][1] === 4) {
    return {
      category: 7,
      kickers: [grouped[0][0], grouped[1][0]],
      label: "Four of a Kind",
    };
  }

  if (grouped[0][1] === 3 && grouped[1][1] === 2) {
    return {
      category: 6,
      kickers: [grouped[0][0], grouped[1][0]],
      label: "Full House",
    };
  }

  if (isFlush) {
    return {
      category: 5,
      kickers: values,
      label: "Flush",
    };
  }

  if (straightHigh > 0) {
    return {
      category: 4,
      kickers: [straightHigh],
      label: "Straight",
    };
  }

  if (grouped[0][1] === 3) {
    return {
      category: 3,
      kickers: [grouped[0][0], grouped[1][0], grouped[2][0]],
      label: "Three of a Kind",
    };
  }

  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    const pairTop = Math.max(grouped[0][0], grouped[1][0]);
    const pairLow = Math.min(grouped[0][0], grouped[1][0]);
    return {
      category: 2,
      kickers: [pairTop, pairLow, grouped[2][0]],
      label: "Two Pair",
    };
  }

  if (grouped[0][1] === 2) {
    const kickers = grouped.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 1,
      kickers: [grouped[0][0], ...kickers],
      label: "One Pair",
    };
  }

  return {
    category: 0,
    kickers: values,
    label: "High Card",
  };
}

function evaluateSeven(cards: Card[]): HandRank {
  const fiveCardCombos = combinations(cards, 5);
  let best = evaluateFive(fiveCardCombos[0]);
  for (const combo of fiveCardCombos.slice(1)) {
    const candidate = evaluateFive(combo);
    if (compareHandRank(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best;
}

function addLog(room: RoomState, line: string): void {
  room.actionLog = [`${new Date().toISOString()} ${line}`, ...room.actionLog].slice(0, MAX_LOGS);
}

function nextSeatFrom(
  room: RoomState,
  startSeat: number,
  eligible: Set<number>,
): number | null {
  for (let offset = 1; offset <= TABLE_SEATS; offset += 1) {
    const candidate = (startSeat + offset) % TABLE_SEATS;
    if (eligible.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function seatedWithChips(room: RoomState): string[] {
  return room.seats
    .map((playerId) => (playerId ? room.players[playerId] : null))
    .filter((player): player is RoomPlayer => Boolean(player && player.stack > 0))
    .map((player) => player.playerId);
}

function getSeatByPlayer(room: RoomState, playerId: string): number {
  const seat = room.players[playerId]?.seatNo;
  if (seat == null) {
    throw new Error("Player is not seated");
  }

  return seat;
}

function drawCards(deck: Card[], count: number): Card[] {
  if (deck.length < count) {
    throw new Error("Deck exhausted");
  }

  return deck.splice(0, count);
}

function playerNeedsAction(hand: HandState, playerId: string): boolean {
  if (hand.folded.has(playerId) || hand.allIn.has(playerId)) {
    return false;
  }

  const matched = hand.contributionsStreet[playerId] === hand.currentBet;
  return !(matched && hand.acted.has(playerId));
}

function chooseNextActor(room: RoomState, hand: HandState, fromPlayerId: string): string | null {
  const fromSeat = getSeatByPlayer(room, fromPlayerId);
  for (let offset = 1; offset <= TABLE_SEATS; offset += 1) {
    const seat = (fromSeat + offset) % TABLE_SEATS;
    const playerId = room.seats[seat];
    if (!playerId) {
      continue;
    }

    if (!hand.activePlayerIds.includes(playerId)) {
      continue;
    }

    if (playerNeedsAction(hand, playerId)) {
      return playerId;
    }
  }

  return null;
}

function postBlind(room: RoomState, hand: HandState, playerId: string, amount: number): void {
  const player = room.players[playerId];
  if (!player) {
    throw new Error("Blind player missing");
  }

  const actual = Math.min(player.stack, amount);
  player.stack -= actual;
  hand.contributionsStreet[playerId] += actual;
  hand.contributionsTotal[playerId] += actual;
  if (player.stack === 0) {
    hand.allIn.add(playerId);
  }
}

function dealChips(room: RoomState, hand: HandState, playerId: string, amountWanted: number): DealOutcome {
  const player = room.players[playerId];
  if (!player) {
    throw new Error("Player not found");
  }

  const amount = Math.min(player.stack, Math.max(0, Math.floor(amountWanted)));
  player.stack -= amount;
  hand.contributionsStreet[playerId] += amount;
  hand.contributionsTotal[playerId] += amount;
  const isAllIn = player.stack === 0;
  if (isAllIn) {
    hand.allIn.add(playerId);
  }

  return { amount, isAllIn };
}

function remainingPlayers(hand: HandState): string[] {
  return hand.activePlayerIds.filter((playerId) => !hand.folded.has(playerId));
}

function buildPotBreakdown(
  contributionsTotal: Record<string, number>,
  activePlayerIds: string[],
  folded: Set<string>,
): PotBreakdownItem[] {
  const levels = Array.from(new Set(Object.values(contributionsTotal).filter((value) => value > 0))).sort(
    (a, b) => a - b,
  );

  const pots: PotBreakdownItem[] = [];
  let previousLevel = 0;

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const contributors = activePlayerIds.filter((playerId) => contributionsTotal[playerId] >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligiblePlayerIds = contributors.filter((playerId) => !folded.has(playerId));

    if (amount > 0 && eligiblePlayerIds.length > 0) {
      pots.push({
        potId: index === 0 ? "main-0" : `side-${index}`,
        kind: index === 0 ? "main" : "side",
        amount,
        eligiblePlayerIds,
        level,
      });
    }

    previousLevel = level;
  }

  return pots;
}

function isRoundComplete(hand: HandState): boolean {
  const alive = remainingPlayers(hand);
  return alive.every((playerId) => {
    if (hand.allIn.has(playerId)) {
      return true;
    }

    return hand.acted.has(playerId) && hand.contributionsStreet[playerId] === hand.currentBet;
  });
}

function revealNextStreet(room: RoomState): void {
  const hand = room.hand;
  if (!hand) {
    return;
  }

  if (hand.street === "preflop") {
    hand.communityCards.push(...drawCards(hand.deck, 3));
    hand.street = "flop";
  } else if (hand.street === "flop") {
    hand.communityCards.push(...drawCards(hand.deck, 1));
    hand.street = "turn";
  } else if (hand.street === "turn") {
    hand.communityCards.push(...drawCards(hand.deck, 1));
    hand.street = "river";
  }

  for (const playerId of hand.activePlayerIds) {
    hand.contributionsStreet[playerId] = 0;
  }
  hand.currentBet = 0;
  hand.minRaise = room.bigBlind;
  hand.acted.clear();

  const alive = remainingPlayers(hand);
  const dealerSeat = room.dealerSeat ?? 0;
  const aliveSeats = new Set(alive.map((playerId) => getSeatByPlayer(room, playerId)));
  const firstSeat = nextSeatFrom(room, dealerSeat, aliveSeats);
  hand.toActPlayerId = firstSeat == null ? null : room.seats[firstSeat];

  if (hand.toActPlayerId && hand.allIn.has(hand.toActPlayerId)) {
    const next = chooseNextActor(room, hand, hand.toActPlayerId);
    hand.toActPlayerId = next;
  }

  addLog(room, `Street moved to ${hand.street}.`);
}

function distributePot(room: RoomState, hand: HandState, winners: string[], amount: number, reason: string): void {
  if (winners.length === 0 || amount <= 0) {
    return;
  }

  const seats = winners
    .map((playerId) => ({ playerId, seatNo: getSeatByPlayer(room, playerId) }))
    .sort((a, b) => a.seatNo - b.seatNo);

  const base = Math.floor(amount / winners.length);
  let remainder = amount % winners.length;

  for (const { playerId } of seats) {
    const player = room.players[playerId];
    if (!player) {
      continue;
    }

    const extra = remainder > 0 ? 1 : 0;
    player.stack += base + extra;
    if (remainder > 0) {
      remainder -= 1;
    }
  }

  room.results.push({
    winnerPlayerIds: winners,
    amount,
    reason,
  });
}

function settleShowdown(room: RoomState): void {
  const hand = room.hand;
  if (!hand) {
    return;
  }

  const alive = remainingPlayers(hand);
  if (alive.length === 1) {
    const only = alive[0];
    const total = Object.values(hand.contributionsTotal).reduce((sum, value) => sum + value, 0);
    distributePot(room, hand, [only], total, "All opponents folded");
    addLog(room, `${room.players[only].displayName} won ${total} chips (folds).`);
    room.status = "waiting";
    hand.street = "settled";
    room.hand = null;
    room.version += 1;
    return;
  }

  hand.street = "showdown";

  const ranksByPlayer = new Map<string, HandRank>();
  for (const playerId of alive) {
    const cards = [...hand.holeCards[playerId], ...hand.communityCards];
    ranksByPlayer.set(playerId, evaluateSeven(cards));
  }

  const contributions = hand.contributionsTotal;
  const potBreakdown = buildPotBreakdown(contributions, hand.activePlayerIds, hand.folded);

  for (let index = 0; index < potBreakdown.length; index += 1) {
    const pot = potBreakdown[index];
    let winningRank: HandRank | null = null;
    let winners: string[] = [];
    for (const playerId of pot.eligiblePlayerIds) {
      const rank = ranksByPlayer.get(playerId);
      if (!rank) {
        continue;
      }

      if (!winningRank || compareHandRank(rank, winningRank) > 0) {
        winningRank = rank;
        winners = [playerId];
      } else if (compareHandRank(rank, winningRank) === 0) {
        winners.push(playerId);
      }
    }

    const reason = winningRank ? `Pot ${index + 1}: ${winningRank.label}` : `Pot ${index + 1}`;
    distributePot(room, hand, winners, pot.amount, reason);
  }

  const winnerSummary = room.results
    .slice(-potBreakdown.length)
    .map((result) =>
      result.winnerPlayerIds.map((id) => room.players[id]?.displayName ?? id).join(", "),
    )
    .join(" | ");

  addLog(room, `Showdown settled: ${winnerSummary}.`);
  hand.street = "settled";
  room.hand = null;
  room.status = "waiting";
  room.version += 1;
}

function runOutToRiver(room: RoomState): void {
  const hand = room.hand;
  if (!hand) {
    return;
  }

  while (hand.street !== "river") {
    revealNextStreet(room);
  }
}

function progressAfterAction(room: RoomState, lastActorId: string): void {
  const hand = room.hand;
  if (!hand) {
    return;
  }

  const alive = remainingPlayers(hand);
  if (alive.length <= 1) {
    settleShowdown(room);
    return;
  }

  const actionable = alive.filter((playerId) => !hand.allIn.has(playerId));
  if (actionable.length === 0) {
    runOutToRiver(room);
    settleShowdown(room);
    return;
  }

  if (isRoundComplete(hand)) {
    if (hand.street === "river") {
      settleShowdown(room);
      return;
    }

    revealNextStreet(room);
    const next = hand.toActPlayerId ? chooseNextActor(room, hand, hand.toActPlayerId) : null;
    if (!next) {
      const aliveCanAct = remainingPlayers(hand).filter((playerId) => !hand.allIn.has(playerId));
      if (aliveCanAct.length === 0) {
        runOutToRiver(room);
        settleShowdown(room);
      }
      return;
    }

    hand.toActPlayerId = next;
    return;
  }

  hand.toActPlayerId = chooseNextActor(room, hand, lastActorId);
}

function assertHost(identity: DecodedIdentity, roomCode: string): void {
  if (identity.payload.roomCode !== roomCode || identity.payload.role !== "host") {
    throw new Error("Forbidden: host token required");
  }
}

function assertPlayer(identity: DecodedIdentity, roomCode: string): string {
  if (identity.payload.roomCode !== roomCode || identity.payload.role !== "player") {
    throw new Error("Forbidden: player token required");
  }

  if (!identity.payload.playerId) {
    throw new Error("Invalid player token");
  }

  return identity.payload.playerId;
}

function decodeIdentity(token: string): DecodedIdentity {
  const payload = verifyToken(token);
  if (!payload) {
    throw new Error("Invalid token");
  }

  return { payload, token };
}

export class GameStore {
  private rooms = new Map<string, RoomState>();

  createRoom(hostDisplayName: string, smallBlind: number, bigBlind: number): {
    roomCode: string;
    roomId: string;
    hostToken: string;
  } {
    if (!hostDisplayName.trim()) {
      throw new Error("Host display name is required");
    }

    const safeSmall = Math.max(1, Math.floor(smallBlind));
    const safeBig = Math.max(safeSmall * 2, Math.floor(bigBlind));

    let roomCode = generateRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const roomId = nextId("room");
    const hostPlayerId = nextId("host");

    const hostPlayer: RoomPlayer = {
      playerId: hostPlayerId,
      displayName: hostDisplayName.trim(),
      seatNo: null,
      stack: 0,
      connectedAt: now(),
    };

    const room: RoomState = {
      roomId,
      roomCode,
      hostPlayerId,
      smallBlind: safeSmall,
      bigBlind: safeBig,
      seats: Array(TABLE_SEATS).fill(null),
      players: {
        [hostPlayerId]: hostPlayer,
      },
      dealerSeat: null,
      status: "waiting",
      handNo: 0,
      hand: null,
      version: 1,
      actionLog: [],
      results: [],
    };

    this.rooms.set(roomCode, room);
    addLog(room, `Room created by ${hostPlayer.displayName}.`);

    const hostToken = createToken({
      roomCode,
      role: "host",
      playerId: hostPlayerId,
      iat: now(),
    });

    return { roomCode, roomId, hostToken };
  }

  joinRoom(roomCode: string, playerDisplayName: string): {
    playerId: string;
    playerToken: string;
    availableSeats: number[];
  } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error("Room not found");
    }

    if (!playerDisplayName.trim()) {
      throw new Error("Player name is required");
    }

    const playerId = nextId("player");
    const nameBase = playerDisplayName.trim();
    const existing = new Set(Object.values(room.players).map((player) => player.displayName));

    let displayName = nameBase;
    let suffix = 2;
    while (existing.has(displayName)) {
      displayName = `${nameBase}${suffix}`;
      suffix += 1;
    }

    room.players[playerId] = {
      playerId,
      displayName,
      seatNo: null,
      stack: 0,
      connectedAt: now(),
    };

    room.version += 1;
    addLog(room, `${displayName} joined room.`);

    const playerToken = createToken({
      roomCode,
      role: "player",
      playerId,
      iat: now(),
    });

    return {
      playerId,
      playerToken,
      availableSeats: this.getAvailableSeats(roomCode),
    };
  }

  seatPlayer(roomCode: string, token: string, seatNo: number, buyIn: number): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    const playerId = assertPlayer(identity, roomCode);

    if (!Number.isInteger(seatNo) || seatNo < 0 || seatNo >= TABLE_SEATS) {
      throw new Error("Invalid seat number");
    }

    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }

    if (room.status === "in_hand") {
      throw new Error("Cannot change seats during active hand");
    }

    if (room.seats[seatNo]) {
      throw new Error("Seat already occupied");
    }

    if (player.seatNo != null) {
      room.seats[player.seatNo] = null;
    }

    const stack = clampBuyIn(buyIn);
    player.seatNo = seatNo;
    player.stack = stack;
    room.seats[seatNo] = playerId;
    room.version += 1;

    addLog(room, `${player.displayName} sat at seat ${seatNo + 1} with ${stack} chips.`);
  }

  startHand(roomCode: string, token: string): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    assertHost(identity, roomCode);

    if (room.status === "in_hand") {
      throw new Error("A hand is already in progress");
    }

    room.results = [];

    const contenders = seatedWithChips(room);
    if (contenders.length < 2) {
      throw new Error("At least two seated players with chips are required");
    }

    const contenderSeats = new Set(contenders.map((playerId) => getSeatByPlayer(room, playerId)));

    const dealerSeat =
      room.dealerSeat == null
        ? Array.from(contenderSeats).sort((a, b) => a - b)[0]
        : nextSeatFrom(room, room.dealerSeat, contenderSeats);

    if (dealerSeat == null) {
      throw new Error("Unable to assign dealer");
    }

    const sbSeat = nextSeatFrom(room, dealerSeat, contenderSeats);
    if (sbSeat == null) {
      throw new Error("Unable to assign small blind");
    }

    const bbSeat = nextSeatFrom(room, sbSeat, contenderSeats);
    if (bbSeat == null) {
      throw new Error("Unable to assign big blind");
    }

    const sbPlayerId = room.seats[sbSeat];
    const bbPlayerId = room.seats[bbSeat];
    if (!sbPlayerId || !bbPlayerId) {
      throw new Error("Blind seats are invalid");
    }

    const deck = createDeck();
    const holeCards: Record<string, [Card, Card]> = {};
    const contributionsTotal: Record<string, number> = {};
    const contributionsStreet: Record<string, number> = {};

    for (const playerId of contenders) {
      contributionsTotal[playerId] = 0;
      contributionsStreet[playerId] = 0;
    }

    const seatOrder = Array.from(contenderSeats).sort((a, b) => a - b);
    for (const seat of seatOrder) {
      const playerId = room.seats[seat];
      if (!playerId) {
        continue;
      }
      holeCards[playerId] = drawCards(deck, 2) as [Card, Card];
    }

    room.dealerSeat = dealerSeat;
    room.handNo += 1;

    const hand: HandState = {
      handNo: room.handNo,
      street: "preflop",
      deck,
      communityCards: [],
      holeCards,
      activePlayerIds: contenders,
      folded: new Set<string>(),
      allIn: new Set<string>(),
      contributionsTotal,
      contributionsStreet,
      currentBet: 0,
      minRaise: room.bigBlind,
      toActPlayerId: null,
      acted: new Set<string>(),
      smallBlindSeat: sbSeat,
      bigBlindSeat: bbSeat,
    };

    postBlind(room, hand, sbPlayerId, room.smallBlind);
    postBlind(room, hand, bbPlayerId, room.bigBlind);
    hand.currentBet = Math.max(
      hand.contributionsStreet[sbPlayerId],
      hand.contributionsStreet[bbPlayerId],
    );

    const firstActorSeat = nextSeatFrom(room, bbSeat, contenderSeats);
    hand.toActPlayerId = firstActorSeat == null ? null : room.seats[firstActorSeat];

    room.hand = hand;
    room.status = "in_hand";
    room.version += 1;

    addLog(
      room,
      `Hand #${hand.handNo} started. Dealer S${dealerSeat + 1}, SB ${room.players[sbPlayerId].displayName}, BB ${room.players[bbPlayerId].displayName}.`,
    );

    if (!hand.toActPlayerId) {
      runOutToRiver(room);
      settleShowdown(room);
    }
  }

  applyAction(roomCode: string, token: string, command: GameActionCommand): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    const playerId = assertPlayer(identity, roomCode);

    const hand = room.hand;
    if (!hand || room.status !== "in_hand") {
      throw new Error("No active hand");
    }

    if (hand.toActPlayerId !== playerId) {
      throw new Error("It is not your turn");
    }

    if (hand.folded.has(playerId) || hand.allIn.has(playerId)) {
      throw new Error("Player cannot act");
    }

    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }

    const toCall = Math.max(0, hand.currentBet - hand.contributionsStreet[playerId]);
    const stackBefore = player.stack;
    const amount = Number.isFinite(command.amount) ? Math.floor(command.amount ?? 0) : 0;

    switch (command.type) {
      case "FOLD": {
        hand.folded.add(playerId);
        hand.acted.add(playerId);
        addLog(room, `${player.displayName} folded.`);
        break;
      }
      case "CHECK": {
        if (toCall !== 0) {
          throw new Error("Cannot check while facing a bet");
        }

        hand.acted.add(playerId);
        addLog(room, `${player.displayName} checked.`);
        break;
      }
      case "CALL": {
        if (toCall <= 0) {
          throw new Error("Nothing to call");
        }

        const outcome = dealChips(room, hand, playerId, toCall);
        hand.acted.add(playerId);
        addLog(
          room,
          `${player.displayName} called ${outcome.amount}${outcome.isAllIn ? " and is all-in" : ""}.`,
        );
        break;
      }
      case "BET": {
        if (toCall !== 0) {
          throw new Error("Cannot bet while facing a bet");
        }

        if (amount <= 0) {
          throw new Error("BET amount is required");
        }
        if (amount % BET_STEP !== 0) {
          throw new Error(`BET amount must be a multiple of ${BET_STEP}`);
        }

        const outcome = dealChips(room, hand, playerId, amount);
        const newStreetTotal = hand.contributionsStreet[playerId];
        const isShortAllIn = outcome.isAllIn && outcome.amount < room.bigBlind;
        if (!isShortAllIn && newStreetTotal < room.bigBlind) {
          throw new Error(`Minimum bet is ${room.bigBlind}`);
        }

        hand.currentBet = Math.max(hand.currentBet, newStreetTotal);
        const raiseSize = newStreetTotal;
        if (raiseSize >= hand.minRaise) {
          hand.minRaise = raiseSize;
          hand.acted.clear();
        }
        hand.acted.add(playerId);
        addLog(
          room,
          `${player.displayName} bet ${outcome.amount}${outcome.isAllIn ? " and is all-in" : ""}.`,
        );
        break;
      }
      case "RAISE": {
        if (toCall <= 0) {
          throw new Error("Use BET when there is no bet to call");
        }

        if (amount <= toCall) {
          throw new Error(`Raise must be greater than call amount (${toCall})`);
        }
        if (amount % BET_STEP !== 0) {
          throw new Error(`RAISE amount must be a multiple of ${BET_STEP}`);
        }

        const outcome = dealChips(room, hand, playerId, amount);
        const streetTotal = hand.contributionsStreet[playerId];
        if (streetTotal <= hand.currentBet) {
          throw new Error("Raise amount too small");
        }

        const raiseBy = streetTotal - hand.currentBet;
        const isShortAllIn = outcome.isAllIn && raiseBy < hand.minRaise;
        if (!isShortAllIn && raiseBy < hand.minRaise) {
          throw new Error(`Minimum raise is ${hand.minRaise}`);
        }

        hand.currentBet = streetTotal;
        if (!isShortAllIn) {
          hand.minRaise = raiseBy;
          hand.acted.clear();
        }

        hand.acted.add(playerId);
        addLog(
          room,
          `${player.displayName} raised to ${streetTotal}${outcome.isAllIn ? " and is all-in" : ""}.`,
        );
        break;
      }
      case "ALL_IN": {
        if (stackBefore <= 0) {
          throw new Error("No chips left");
        }

        const outcome = dealChips(room, hand, playerId, stackBefore);
        const streetTotal = hand.contributionsStreet[playerId];

        if (streetTotal > hand.currentBet) {
          const raiseBy = streetTotal - hand.currentBet;
          const fullRaise =
            hand.currentBet === 0 ? raiseBy >= room.bigBlind : raiseBy >= hand.minRaise;

          hand.currentBet = streetTotal;
          if (fullRaise) {
            hand.minRaise = Math.max(raiseBy, room.bigBlind);
            hand.acted.clear();
          }
        }

        hand.acted.add(playerId);
        addLog(room, `${player.displayName} moved all-in for ${outcome.amount}.`);
        break;
      }
      default:
        throw new Error("Unsupported action");
    }

    room.version += 1;
    progressAfterAction(room, playerId);
  }

  getSnapshot(roomCode: string, token?: string): RoomSnapshot {
    const room = this.getRoom(roomCode);

    let role: AuthRole | null = null;
    let viewerId: string | null = null;
    if (token) {
      const identity = decodeIdentity(token);
      if (identity.payload.roomCode === roomCode) {
        role = identity.payload.role;
        viewerId = identity.payload.playerId ?? null;
      }
    }

    const hand = room.hand;
    const players: PlayerPublicState[] = room.seats
      .map((playerId, seatNo) => {
        if (!playerId) {
          return null;
        }

        const player = room.players[playerId];
        if (!player) {
          return null;
        }

        const inHand = hand ? hand.activePlayerIds.includes(playerId) : false;
        return {
          playerId,
          displayName: player.displayName,
          seatNo,
          stack: player.stack,
          inHand,
          folded: hand ? hand.folded.has(playerId) : false,
          allIn: hand ? hand.allIn.has(playerId) : false,
          streetContribution: hand ? hand.contributionsStreet[playerId] ?? 0 : 0,
          contribution: hand ? hand.contributionsTotal[playerId] ?? 0 : 0,
          isDealer: room.dealerSeat === seatNo,
          isSmallBlind: hand ? hand.smallBlindSeat === seatNo : false,
          isBigBlind: hand ? hand.bigBlindSeat === seatNo : false,
          isTurn: hand ? hand.toActPlayerId === playerId : false,
        };
      })
      .filter((player): player is PlayerPublicState => Boolean(player));

    const privateState: PlayerPrivateState | null =
      viewerId && hand && hand.holeCards[viewerId]
        ? {
            holeCards:
              role === "host" || viewerId === hand.toActPlayerId || hand.street === "showdown"
                ? hand.holeCards[viewerId]
                : hand.holeCards[viewerId],
            allowedActions:
              role === "player" && viewerId === hand.toActPlayerId
                ? this.computeAllowedActions(room, viewerId)
                : null,
          }
        : null;

    const potBreakdown =
      hand != null
        ? buildPotBreakdown(hand.contributionsTotal, hand.activePlayerIds, hand.folded)
        : [];
    const totalPot = hand
      ? Object.values(hand.contributionsTotal).reduce((sum, value) => sum + value, 0)
      : 0;

    return {
      roomCode: room.roomCode,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      status: room.status,
      version: room.version,
      handNo: room.handNo,
      street: hand?.street ?? null,
      pot: totalPot,
      pots: potBreakdown,
      hasSidePot: potBreakdown.some((item) => item.kind === "side"),
      minRaise: hand?.minRaise ?? room.bigBlind,
      currentBet: hand?.currentBet ?? 0,
      dealerSeat: room.dealerSeat,
      communityCards: hand?.communityCards ?? [],
      players,
      actionLog: room.actionLog,
      results: room.results,
      yourPlayerId: viewerId,
      yourPrivateState: privateState,
    };
  }

  getAvailableSeats(roomCode: string): number[] {
    const room = this.getRoom(roomCode);
    const seats: number[] = [];
    for (let seat = 0; seat < TABLE_SEATS; seat += 1) {
      if (!room.seats[seat]) {
        seats.push(seat);
      }
    }
    return seats;
  }

  private computeAllowedActions(room: RoomState, playerId: string): AllowedActions {
    const hand = room.hand;
    if (!hand) {
      return {
        fold: false,
        check: false,
        call: false,
        bet: false,
        raise: false,
        allIn: false,
        toCall: 0,
        minBet: room.bigBlind,
        minRaiseTo: room.bigBlind,
        maxPut: 0,
      };
    }

    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }

    const stack = player.stack;
    const toCall = Math.max(0, hand.currentBet - hand.contributionsStreet[playerId]);
    const minRaiseTo = hand.currentBet + hand.minRaise;

    return {
      fold: true,
      check: toCall === 0,
      call: toCall > 0 && stack > 0,
      bet: toCall === 0 && stack > 0,
      raise: toCall > 0 && stack > toCall,
      allIn: stack > 0,
      toCall,
      minBet: room.bigBlind,
      minRaiseTo,
      maxPut: stack,
    };
  }

  private getRoom(roomCode: string): RoomState {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __holdemStore: GameStore | undefined;
}

export const gameStore = global.__holdemStore ?? new GameStore();
global.__holdemStore = gameStore;
