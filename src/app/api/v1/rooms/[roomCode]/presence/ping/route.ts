import { NextRequest, NextResponse } from "next/server";
import type { PresencePingRequest, PresencePingResponse } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "presence_ping",
    defaultErrorMessage: "Failed to ping presence",
    requestLevel: "debug",
    successLevel: "debug",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const body = await readJson<PresencePingRequest>(request);
    const serverNow = gameStore.touchPresence(params.roomCode.toUpperCase(), body.token);

    const response: PresencePingResponse = {
      ok: true,
      serverNow,
    };
    return NextResponse.json(response, { status: 200 });
  },
);
