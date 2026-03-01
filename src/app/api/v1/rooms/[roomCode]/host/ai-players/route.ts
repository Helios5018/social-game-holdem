import { NextRequest, NextResponse } from "next/server";
import type {
  AddAiPlayerRequest,
  AddAiPlayerResponse,
  ListAiPlayersResponse,
} from "@/lib/protocol/types";
import { aiManager } from "@/lib/ai/ai-manager";
import { gameStore } from "@/lib/server/game-store";
import { verifyToken } from "@/lib/server/auth";
import { getBearerToken, readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

const RECHARGE_STEP = 5;

function assertHostToken(roomCode: string, token: string): void {
  const payload = verifyToken(token);
  if (!payload || payload.role !== "host" || payload.roomCode !== roomCode) {
    throw new Error("Forbidden: host token required");
  }

  // Ensure room exists in current process memory.
  gameStore.getAvailableSeats(roomCode);
}

function normalizePersonality(input: string): string {
  const personality = input.trim();
  return personality || "balanced";
}

function validateInitialChips(initialChips: number): number {
  const amount = Number.isFinite(initialChips) ? Math.floor(initialChips) : 0;
  if (amount <= 0) {
    throw new Error("Initial chips must be positive");
  }
  if (amount % RECHARGE_STEP !== 0) {
    throw new Error(`Initial chips must be a multiple of ${RECHARGE_STEP}`);
  }
  return amount;
}

export const POST = withApiLogging(
  {
    event: "add_ai_player",
    defaultErrorMessage: "Failed to add AI player",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const roomCode = params.roomCode.toUpperCase();
    const body = await readJson<AddAiPlayerRequest>(request);

    assertHostToken(roomCode, body.token);

    const snapshot = gameStore.getSnapshot(roomCode, body.token);
    if (snapshot.status !== "waiting") {
      throw new Error("AI players can only be added before a hand starts");
    }

    const seats = gameStore.getAvailableSeats(roomCode);
    if (seats.length === 0) {
      throw new Error("No available seats");
    }

    const seatNo = seats[0];
    const requestedDisplayName = body.displayName?.trim() || "AI";
    const personality = normalizePersonality(body.personality ?? "balanced");
    const initialChips = validateInitialChips(body.initialChips);

    const joined = gameStore.joinRoom(roomCode, requestedDisplayName);

    try {
      gameStore.seatPlayer(roomCode, joined.playerToken, seatNo);
      gameStore.rechargePlayer(roomCode, body.token, joined.playerId, initialChips);
      const actualDisplayName =
        gameStore
          .getSnapshot(roomCode, body.token)
          .players.find((item) => item.playerId === joined.playerId)?.displayName ?? requestedDisplayName;
      aiManager.register({
        playerId: joined.playerId,
        roomCode,
        displayName: actualDisplayName,
        personality,
        token: joined.playerToken,
      });

      const scheduler = await import("@/lib/ai/ai-scheduler");
      scheduler.ensureAiSchedulerConnected();

      gameStore.appendActionLog(
        roomCode,
        `[AI管理] 已添加 ${actualDisplayName}（S${seatNo + 1}，初始筹码 ${initialChips}，人设：${personality}）`,
      );
    } catch (error) {
      aiManager.unregister(roomCode, joined.playerId);
      try {
        gameStore.removePlayer(roomCode, body.token, joined.playerId);
      } catch {
        // Best effort rollback.
      }
      throw error;
    }

    const response: AddAiPlayerResponse = {
      playerId: joined.playerId,
      displayName:
        gameStore
          .getSnapshot(roomCode, body.token)
          .players.find((item) => item.playerId === joined.playerId)?.displayName ?? requestedDisplayName,
      seatNo,
      personality,
    };

    return NextResponse.json(response, { status: 201 });
  },
);

export const GET = withApiLogging(
  {
    event: "list_ai_players",
    defaultErrorMessage: "Failed to list AI players",
    requestLevel: "debug",
    successLevel: "debug",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const roomCode = params.roomCode.toUpperCase();
    const token = getBearerToken(request) ?? "";
    if (!token) {
      throw new Error("Host token is required");
    }

    assertHostToken(roomCode, token);

    const response: ListAiPlayersResponse = {
      items: aiManager.listForRoom(roomCode),
    };

    return NextResponse.json(response);
  },
);
