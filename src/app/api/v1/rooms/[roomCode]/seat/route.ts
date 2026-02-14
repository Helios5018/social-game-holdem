import { NextRequest, NextResponse } from "next/server";
import type { SeatRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { roomCode: string } },
) {
  try {
    const body = await readJson<SeatRequest>(request);
    gameStore.seatPlayer(params.roomCode.toUpperCase(), body.token, body.seatNo, body.buyIn);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seat player";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
