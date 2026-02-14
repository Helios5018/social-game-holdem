import { NextRequest, NextResponse } from "next/server";
import type { SeatRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "seat_player",
    defaultErrorMessage: "Failed to seat player",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const body = await readJson<SeatRequest>(request);
    gameStore.seatPlayer(params.roomCode.toUpperCase(), body.token, body.seatNo);
    return NextResponse.json({ ok: true });
  },
);
