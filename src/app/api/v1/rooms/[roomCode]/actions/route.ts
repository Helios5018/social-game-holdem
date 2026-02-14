import { NextRequest, NextResponse } from "next/server";
import type { PlayerActionRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "apply_action",
    defaultErrorMessage: "Failed to apply action",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const body = await readJson<PlayerActionRequest>(request);
    gameStore.applyAction(params.roomCode.toUpperCase(), body.token, body.command);
    return NextResponse.json({ ok: true });
  },
);
