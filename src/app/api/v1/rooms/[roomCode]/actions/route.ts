import { NextRequest, NextResponse } from "next/server";
import type { PlayerActionRequest } from "@/lib/protocol/types";
import { gameStore } from "@/lib/server/game-store";
import { readJson } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { roomCode: string } },
) {
  try {
    const body = await readJson<PlayerActionRequest>(request);
    gameStore.applyAction(params.roomCode.toUpperCase(), body.token, body.command);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
