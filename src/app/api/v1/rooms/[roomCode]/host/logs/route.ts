import { NextRequest, NextResponse } from "next/server";
import type { HostLogsResponse, ServerLogLevel } from "@/lib/protocol/types";
import { verifyToken } from "@/lib/server/auth";
import { gameStore } from "@/lib/server/game-store";
import { getBearerToken } from "@/lib/server/http";
import { allowDebugLogsInUi, queryServerLogs } from "@/lib/server/logger";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

function parseLimit(input: string | null): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(1, Math.min(200, parsed));
}

export const GET = withApiLogging(
  {
    event: "host_logs",
    defaultErrorMessage: "Failed to load host logs",
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

    const payload = verifyToken(token);
    if (!payload || payload.role !== "host" || payload.roomCode !== roomCode) {
      throw new Error("Forbidden: host token required");
    }

    // Ensure the room exists and token matches room context.
    gameStore.getSnapshot(roomCode, token);

    const allowDebug = allowDebugLogsInUi();
    const includeDebug =
      request.nextUrl.searchParams.get("includeDebug") === "true" && allowDebug;
    const levels: ServerLogLevel[] = includeDebug
      ? ["debug", "info", "warn", "error"]
      : ["info", "warn", "error"];

    const response: HostLogsResponse = {
      ...queryServerLogs({
      roomCode,
      levels,
      since: request.nextUrl.searchParams.get("since") ?? undefined,
      limit: parseLimit(request.nextUrl.searchParams.get("limit")),
      includeGlobalAlerts: true,
      }),
      allowDebug,
    };

    return NextResponse.json(response);
  },
);
