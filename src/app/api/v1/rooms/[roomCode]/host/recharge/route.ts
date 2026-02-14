import { NextRequest, NextResponse } from "next/server";
import type { RechargePlayerRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "recharge_player",
    defaultErrorMessage: "Failed to recharge player",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
    const body = await readJson<RechargePlayerRequest>(request);
    gameStore.rechargePlayer(
      params.roomCode.toUpperCase(),
      body.token,
      body.playerId,
      body.amount,
    );
    return NextResponse.json({ ok: true });
  },
);
