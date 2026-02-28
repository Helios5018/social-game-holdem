import type { AllowedActions } from "@/lib/protocol/types";
import type { RoomState } from "@/lib/server/room-types";
import type { AiPlayerConfig } from "./ai-types";

function describePersonality(personality: string): string {
  const normalized = personality.trim().toLowerCase();
  if (normalized === "aggressive") {
    return "You are an aggressive poker player. Prefer pressure lines, larger bets, and thin value when legal.";
  }
  if (normalized === "conservative") {
    return "You are a conservative poker player. Prioritize low-risk lines and preserve stack when uncertain.";
  }
  if (normalized === "balanced") {
    return "You are a balanced poker player. Mix value, protection, and pot control with disciplined sizing.";
  }

  return `Adopt this persona while remaining rules-compliant: ${personality.trim()}`;
}

function cardLabel(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit[0]?.toUpperCase() ?? ""}`;
}

function seatRole(room: RoomState, playerId: string): string {
  const seatNo = room.players[playerId]?.seatNo;
  if (seatNo == null) {
    return "unknown";
  }

  const hand = room.hand;
  if (!hand) {
    return "unknown";
  }

  if (room.dealerSeat === seatNo) {
    return "dealer";
  }
  if (hand.smallBlindSeat === seatNo) {
    return "small_blind";
  }
  if (hand.bigBlindSeat === seatNo) {
    return "big_blind";
  }
  return "seat_player";
}

export function buildSystemPrompt(config: AiPlayerConfig): string {
  return [
    "You are acting as an AI poker player in a No-Limit Texas Hold'em home game.",
    "Return exactly one JSON object and no extra prose.",
    "Valid actions: FOLD, CHECK, CALL, BET, RAISE, ALL_IN.",
    "For BET and RAISE, `amount` means chips to put in NOW (additional chips this action), not total-to value.",
    "All amounts must be integer multiples of 5.",
    describePersonality(config.personality),
  ].join("\n");
}

export function buildGameContext(
  room: RoomState,
  playerId: string,
  allowedActions: AllowedActions,
): Record<string, unknown> {
  const hand = room.hand;
  if (!hand) {
    return {
      status: room.status,
      message: "No active hand",
    };
  }

  const me = room.players[playerId];
  const mySeatNo = me?.seatNo ?? -1;

  const opponents = hand.activePlayerIds
    .filter((id) => id !== playerId)
    .map((id) => {
      const player = room.players[id];
      return {
        playerId: id,
        displayName: player?.displayName ?? id,
        seatNo: player?.seatNo ?? null,
        stack: player?.stack ?? 0,
        streetContribution: hand.contributionsStreet[id] ?? 0,
        totalContribution: hand.contributionsTotal[id] ?? 0,
        folded: hand.folded.has(id),
        allIn: hand.allIn.has(id),
      };
    });

  return {
    roomCode: room.roomCode,
    handNo: room.handNo,
    status: room.status,
    street: hand.street,
    pot: Object.values(hand.contributionsTotal).reduce((sum, value) => sum + value, 0),
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    toActPlayerId: hand.toActPlayerId,
    communityCards: hand.communityCards.map(cardLabel),
    hero: {
      playerId,
      displayName: me?.displayName ?? playerId,
      seatNo: mySeatNo,
      role: seatRole(room, playerId),
      stack: me?.stack ?? 0,
      holeCards: hand.holeCards[playerId]?.map(cardLabel) ?? [],
      streetContribution: hand.contributionsStreet[playerId] ?? 0,
      totalContribution: hand.contributionsTotal[playerId] ?? 0,
      folded: hand.folded.has(playerId),
      allIn: hand.allIn.has(playerId),
    },
    opponents,
    allowedActions,
  };
}

export function buildUserPrompt(context: Record<string, unknown>, personality: string): string {
  return [
    "Game context JSON:",
    JSON.stringify(context),
    "",
    "Choose one legal action based on current game context.",
    "Output JSON only with schema:",
    '{"action":"FOLD|CHECK|CALL|BET|RAISE|ALL_IN","amount":number?,"reasoning":"short reason"}',
    "If action is not BET/RAISE you may omit amount.",
    "Remember: BET/RAISE amount means additional chips to put in now.",
    `Persona: ${personality}`,
  ].join("\n");
}
