import { NextRequest, NextResponse } from "next/server";
import type { StartHandRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "start_hand",
    defaultErrorMessage: "Failed to start hand",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const body = await readJson<StartHandRequest>(request);
    gameStore.startHand(params.roomCode.toUpperCase(), body.token);
    return NextResponse.json({ ok: true });
  },
);
