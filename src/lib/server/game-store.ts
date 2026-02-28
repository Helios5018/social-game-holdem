import crypto from "node:crypto";
import {
  type AllowedActions,
  type Card,
  type CardRank,
  type CardSuit,
  type GameActionCommand,
  type HandResult,
  type RoomSnapshot,
  type ShowdownDetail,
  type Street,
} from "@/lib/protocol/types";
import { createToken, type AuthRole, type TokenPayload, verifyToken } from "./auth";
import { logServer } from "./logger";
import type { HandState, RoomPlayer, RoomState } from "./room-types";
import { compareHandRank, evaluateSeven } from "@/lib/game/hand-evaluator";
import { buildPotBreakdown } from "@/lib/game/pot-calculator";
import { buildSnapshot } from "@/lib/game/snapshot-builder";

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
const BET_STEP = 5;
const RECHARGE_STEP = 5;
const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_SPACE = 10 ** ROOM_CODE_LENGTH;
const ROOM_CODE_PATTERN = /^\d{4}$/;

export type AfterStateChangeHook = (room: RoomState) => void;
let afterStateChangeHook: AfterStateChangeHook | null = null;

export function setAfterStateChangeHook(hook: AfterStateChangeHook | null): void {
  afterStateChangeHook = hook;
}

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function now(): number {
  return Date.now();
}

function generateRoomCode(): string {
  const value = crypto.randomInt(0, ROOM_CODE_SPACE);
  return String(value).padStart(ROOM_CODE_LENGTH, "0");
}

function normalizeRoomCode(roomCode: string): string {
  const normalized = roomCode.trim();
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    throw new Error("Room code must be 4 digits");
  }
  return normalized;
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

function addLog(room: RoomState, line: string): void {
  room.actionLog = [`${new Date().toISOString()} ${line}`, ...room.actionLog].slice(0, MAX_LOGS);
}

function logGameEvent(
  room: RoomState,
  level: "info" | "warn" | "error",
  event: string,
  message: string,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  logServer({
    level,
    scope: "game",
    roomCode: room.roomCode,
    event,
    message,
    meta,
  });
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
  logGameEvent(room, "info", "street_advanced", `Street moved to ${hand.street}.`, {
    handNo: hand.handNo,
    street: hand.street,
    communityCount: hand.communityCards.length,
  });
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
    room.lastShowdown = null;
    addLog(room, `${room.players[only].displayName} won ${total} chips (folds).`);
    logGameEvent(room, "info", "showdown_settled", "Hand settled by folds.", {
      handNo: hand.handNo,
      winnerPlayerId: only,
      winnerName: room.players[only]?.displayName ?? only,
      amount: total,
    });
    room.status = "waiting";
    hand.street = "settled";
    room.hand = null;
    room.version += 1;
    return;
  }

  hand.street = "showdown";

  const ranksByPlayer = new Map<string, ReturnType<typeof evaluateSeven>>();
  for (const playerId of alive) {
    const cards = [...hand.holeCards[playerId], ...hand.communityCards];
    ranksByPlayer.set(playerId, evaluateSeven(cards));
  }

  const contributions = hand.contributionsTotal;
  const potBreakdown = buildPotBreakdown(contributions, hand.activePlayerIds, hand.folded);
  const resultsStart = room.results.length;

  for (let index = 0; index < potBreakdown.length; index += 1) {
    const pot = potBreakdown[index];
    let winningRank: ReturnType<typeof evaluateSeven> | null = null;
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

  const showdownResults = room.results.slice(resultsStart);
  const winners = new Set(showdownResults.flatMap((result) => result.winnerPlayerIds));
  const orderedAlive = alive
    .slice()
    .sort((left, right) => getSeatByPlayer(room, left) - getSeatByPlayer(room, right));
  room.lastShowdown = {
    handNo: hand.handNo,
    communityCards: hand.communityCards.slice(),
    players: orderedAlive.map((playerId) => ({
      playerId,
      displayName: room.players[playerId]?.displayName ?? playerId,
      holeCards: [...hand.holeCards[playerId]],
      handLabel: ranksByPlayer.get(playerId)?.label ?? "Unknown",
      isWinner: winners.has(playerId),
    })),
  };

  const winnerSummary = room.results
    .slice(-potBreakdown.length)
    .map((result) =>
      result.winnerPlayerIds.map((id) => room.players[id]?.displayName ?? id).join(", "),
    )
    .join(" | ");

  addLog(room, `Showdown settled: ${winnerSummary}.`);
  logGameEvent(room, "info", "showdown_settled", "Showdown settled.", {
    handNo: hand.handNo,
    winners: winnerSummary,
    pots: potBreakdown.length,
    totalPot: Object.values(contributions).reduce((sum, value) => sum + value, 0),
  });
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

    if (this.rooms.size >= ROOM_CODE_SPACE) {
      throw new Error("Room capacity reached");
    }

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
      lastSeenAt: now(),
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
      lastShowdown: null,
    };

    this.rooms.set(roomCode, room);
    addLog(room, `Room created by ${hostPlayer.displayName}.`);
    logGameEvent(room, "info", "room_created", "Room created.", {
      hostPlayerId,
      hostName: hostPlayer.displayName,
      smallBlind: safeSmall,
      bigBlind: safeBig,
    });

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
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalizedRoomCode);
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
      lastSeenAt: now(),
    };

    room.version += 1;
    addLog(room, `${displayName} joined room.`);
    logGameEvent(room, "info", "player_joined", "Player joined room.", {
      playerId,
      playerName: displayName,
      connectedPlayers: Object.keys(room.players).length,
    });

    const playerToken = createToken({
      roomCode: normalizedRoomCode,
      role: "player",
      playerId,
      iat: now(),
    });

    return {
      playerId,
      playerToken,
      availableSeats: this.getAvailableSeats(normalizedRoomCode),
    };
  }

  seatPlayer(roomCode: string, token: string, seatNo: number): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    const playerId = assertPlayer(identity, roomCode);
    this.touchPlayerPresence(room, playerId);

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

    player.seatNo = seatNo;
    room.seats[seatNo] = playerId;
    room.version += 1;

    addLog(room, `${player.displayName} sat at seat ${seatNo + 1}.`);
    logGameEvent(room, "info", "player_seated", "Player seated.", {
      playerId,
      playerName: player.displayName,
      seatNo: seatNo + 1,
    });
  }

  rechargePlayer(roomCode: string, token: string, targetPlayerId: string, amount: number): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    assertHost(identity, roomCode);
    const hostPlayerId = identity.payload.playerId;
    if (!hostPlayerId) {
      throw new Error("Invalid host token");
    }
    this.touchPlayerPresence(room, hostPlayerId);

    if (room.status === "in_hand") {
      throw new Error("Cannot recharge during active hand");
    }

    const target = room.players[targetPlayerId];
    if (!target) {
      throw new Error("Target player not found");
    }

    if (target.seatNo == null) {
      throw new Error("Target player must be seated");
    }

    const rechargeAmount = Number.isFinite(amount) ? Math.floor(amount) : 0;
    if (rechargeAmount <= 0) {
      throw new Error("Recharge amount must be positive");
    }
    if (rechargeAmount % RECHARGE_STEP !== 0) {
      throw new Error(`Recharge amount must be a multiple of ${RECHARGE_STEP}`);
    }

    target.stack += rechargeAmount;
    room.version += 1;
    addLog(room, `${target.displayName} recharged +${rechargeAmount} chips.`);
    logGameEvent(room, "info", "recharge_applied", "Host recharged player chips.", {
      hostPlayerId: identity.payload.playerId ?? null,
      targetPlayerId,
      targetName: target.displayName,
      amount: rechargeAmount,
      nextStack: target.stack,
    });
  }

  removePlayer(roomCode: string, token: string, targetPlayerId: string): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    assertHost(identity, roomCode);
    const hostPlayerId = identity.payload.playerId;
    if (!hostPlayerId) {
      throw new Error("Invalid host token");
    }
    this.touchPlayerPresence(room, hostPlayerId);

    if (room.status !== "waiting") {
      throw new Error("Cannot remove players during active hand");
    }

    if (targetPlayerId === room.hostPlayerId) {
      throw new Error("Cannot remove host player");
    }

    const target = room.players[targetPlayerId];
    if (!target) {
      throw new Error("Target player not found");
    }

    if (target.seatNo != null) {
      room.seats[target.seatNo] = null;
    }

    delete room.players[targetPlayerId];
    room.version += 1;
    addLog(room, `${target.displayName} removed from room.`);
    logGameEvent(room, "info", "player_removed", "Player removed from room.", {
      hostPlayerId,
      targetPlayerId,
      targetName: target.displayName,
    });
  }

  startHand(roomCode: string, token: string): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    assertHost(identity, roomCode);
    const hostPlayerId = identity.payload.playerId;
    if (!hostPlayerId) {
      throw new Error("Invalid host token");
    }
    this.touchPlayerPresence(room, hostPlayerId);

    if (room.status === "in_hand") {
      throw new Error("A hand is already in progress");
    }

    const seatedPlayerIds = room.seats.filter((playerId): playerId is string => Boolean(playerId));
    const invalidSeated = seatedPlayerIds.filter((playerId) => (room.players[playerId]?.stack ?? 0) <= 0);
    if (invalidSeated.length > 0) {
      logGameEvent(room, "warn", "start_hand_blocked", "Start hand blocked by zero-stack seated player.", {
        invalidCount: invalidSeated.length,
        invalidPlayerIds: invalidSeated.join(","),
      });
      throw new Error("All seated players must have chips before starting a hand");
    }

    room.results = [];
    room.lastShowdown = null;

    const contenders = seatedWithChips(room);
    if (contenders.length < 2) {
      logGameEvent(room, "warn", "start_hand_blocked", "Start hand blocked by insufficient contenders.", {
        contenderCount: contenders.length,
      });
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
      processedActionIds: new Set<string>(),
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
    logGameEvent(room, "info", "hand_started", "Hand started.", {
      handNo: hand.handNo,
      dealerSeat: dealerSeat + 1,
      sbSeat: sbSeat + 1,
      bbSeat: bbSeat + 1,
      sbPlayerId,
      bbPlayerId,
      contenderCount: contenders.length,
    });

    if (!hand.toActPlayerId) {
      runOutToRiver(room);
      settleShowdown(room);
    } else if (room.status === "in_hand") {
      afterStateChangeHook?.(room);
    }
  }

  applyAction(roomCode: string, token: string, command: GameActionCommand): void {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    const playerId = assertPlayer(identity, roomCode);
    this.touchPlayerPresence(room, playerId);

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

    // Idempotency: silently ignore duplicate action submissions (e.g. network retries).
    if (hand.processedActionIds.has(command.actionId)) {
      return;
    }
    hand.processedActionIds.add(command.actionId);

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

    logGameEvent(room, "info", "action_applied", "Player action applied.", {
      handNo: hand.handNo,
      street: hand.street,
      playerId,
      playerName: player.displayName,
      actionType: command.type,
      requestedAmount: command.amount ?? null,
      toCall,
      currentBet: hand.currentBet,
      stackAfter: player.stack,
    });

    room.version += 1;
    progressAfterAction(room, playerId);
    afterStateChangeHook?.(room);
  }

  getSnapshot(roomCode: string, token?: string): RoomSnapshot {
    const room = this.getRoom(roomCode);
    const nowTs = now();

    let role: AuthRole | null = null;
    let viewerId: string | null = null;
    let allowedActions = null;

    if (token) {
      try {
        const identity = decodeIdentity(token);
        if (identity.payload.roomCode === roomCode) {
          role = identity.payload.role;
          viewerId = identity.payload.playerId ?? null;
          if (viewerId) {
            this.touchPlayerPresence(room, viewerId, nowTs);
          }
          if (role === "player" && viewerId && room.hand?.toActPlayerId === viewerId) {
            allowedActions = this.computeAllowedActions(room, viewerId);
          }
        }
      } catch {
        // Invalid token — treat as anonymous viewer.
      }
    }

    return buildSnapshot(room, viewerId, role, allowedActions, nowTs);
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

  touchPresence(roomCode: string, token: string): number {
    const room = this.getRoom(roomCode);
    const identity = decodeIdentity(token);
    if (identity.payload.roomCode !== room.roomCode) {
      throw new Error("Token room mismatch");
    }
    const playerId = identity.payload.playerId;
    if (!playerId) {
      throw new Error("Invalid token");
    }
    return this.touchPlayerPresence(room, playerId);
  }

  computeAllowedActions(room: RoomState, playerId: string): AllowedActions {
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
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalizedRoomCode);
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }

  private touchPlayerPresence(room: RoomState, playerId: string, touchedAt = now()): number {
    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }
    player.lastSeenAt = touchedAt;
    return touchedAt;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __holdemStore: GameStore | undefined;
}

export const gameStore = global.__holdemStore ?? new GameStore();
global.__holdemStore = gameStore;
