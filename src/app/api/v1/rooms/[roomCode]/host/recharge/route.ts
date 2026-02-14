import { NextRequest, NextResponse } from "next/server";
import type { RechargePlayerRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { roomCode: string } },
) {
  try {
    const body = await readJson<RechargePlayerRequest>(request);
    gameStore.rechargePlayer(
      params.roomCode.toUpperCase(),
      body.token,
      body.playerId,
      body.amount,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to recharge player";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
