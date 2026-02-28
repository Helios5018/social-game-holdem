import { NextRequest, NextResponse } from "next/server";
import { gameStore } from "@/lib/server/game-store";
import { getBearerToken } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const GET = withApiLogging(
  {
    event: "get_snapshot",
    defaultErrorMessage: "Failed to load snapshot",
    requestLevel: "debug",
    successLevel: "debug",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const roomCode = params.roomCode.toUpperCase();
    const token = getBearerToken(request);
    const snapshot = gameStore.getSnapshot(roomCode, token);
    return NextResponse.json(snapshot);
  },
);
