import type { AuthRole } from "@/lib/server/auth";
import type { RoomState } from "@/lib/server/room-types";
import type {
  AllowedActions,
  PlayerPrivateState,
  PlayerPublicState,
  RoomSnapshot,
} from "@/lib/protocol/types";
import { buildPotBreakdown } from "./pot-calculator";

const OFFLINE_THRESHOLD_MS = 8_000;

function isConnected(lastSeenAt: number, nowTs: number): boolean {
  return nowTs - lastSeenAt <= OFFLINE_THRESHOLD_MS;
}

export function buildSnapshot(
  room: RoomState,
  viewerId: string | null,
  role: AuthRole | null,
  allowedActions: AllowedActions | null,
  nowTs: number,
): RoomSnapshot {
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
        isConnected: isConnected(player.lastSeenAt, nowTs),
        lastSeenAt: player.lastSeenAt,
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
          holeCards: hand.holeCards[viewerId],
          allowedActions:
            role === "player" && viewerId === hand.toActPlayerId ? allowedActions : null,
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
    lastShowdown: room.lastShowdown,
    yourPlayerId: viewerId,
    yourPrivateState: privateState,
  };
}
