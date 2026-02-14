import { NextRequest, NextResponse } from "next/server";
import { gameStore } from "@/lib/server/game-store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { roomCode: string } },
) {
  try {
    const roomCode = params.roomCode.toUpperCase();
    const token = request.nextUrl.searchParams.get("token") ?? undefined;
    const snapshot = gameStore.getSnapshot(roomCode, token);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
