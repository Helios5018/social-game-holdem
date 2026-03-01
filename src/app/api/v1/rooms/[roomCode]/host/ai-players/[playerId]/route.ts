import { NextRequest, NextResponse } from "next/server";
import type { AiPlayerInfo, BasicOkResponse, UpdateAiPersonalityRequest } from "@/lib/protocol/types";
import { aiManager } from "@/lib/ai/ai-manager";
import { verifyToken } from "@/lib/server/auth";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

interface DeleteAiPlayerRequest {
  token: string;
}

function assertHostToken(roomCode: string, token: string): void {
  const payload = verifyToken(token);
  if (!payload || payload.role !== "host" || payload.roomCode !== roomCode) {
    throw new Error("Forbidden: host token required");
  }

  gameStore.getAvailableSeats(roomCode);
}

export const PATCH = withApiLogging(
  {
    event: "update_ai_personality",
    defaultErrorMessage: "Failed to update AI personality",
    resolveRoomCode: (_request, context: { params: { roomCode: string; playerId: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (
    request: NextRequest,
    { params }: { params: { roomCode: string; playerId: string } },
  ) => {
    const roomCode = params.roomCode.toUpperCase();
    const body = await readJson<UpdateAiPersonalityRequest>(request);
    assertHostToken(roomCode, body.token);

    const previous = aiManager.getConfig(roomCode, params.playerId);
    if (!previous) {
      throw new Error("AI player not found");
    }

    const next = aiManager.updatePersonality(roomCode, params.playerId, body.personality);
    gameStore.appendActionLog(
      roomCode,
      `[AI管理] 已更新 ${next.displayName} 人设：${previous.personality} -> ${next.personality}`,
    );
    const response: AiPlayerInfo = {
      roomCode: next.roomCode,
      playerId: next.playerId,
      displayName: next.displayName,
      personality: next.personality,
    };

    return NextResponse.json(response);
  },
);

export const DELETE = withApiLogging(
  {
    event: "remove_ai_player",
    defaultErrorMessage: "Failed to remove AI player",
    resolveRoomCode: (_request, context: { params: { roomCode: string; playerId: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (
    request: NextRequest,
    { params }: { params: { roomCode: string; playerId: string } },
  ) => {
    const roomCode = params.roomCode.toUpperCase();
    const body = await readJson<DeleteAiPlayerRequest>(request);
    assertHostToken(roomCode, body.token);

    const config = aiManager.getConfig(roomCode, params.playerId);
    if (!config) {
      throw new Error("AI player not found");
    }

    gameStore.removePlayer(roomCode, body.token, params.playerId);
    aiManager.unregister(roomCode, params.playerId);
    gameStore.appendActionLog(roomCode, `[AI管理] 已移除 ${config.displayName}（${config.playerId}）`);

    const response: BasicOkResponse = { ok: true };
    return NextResponse.json(response);
  },
);
