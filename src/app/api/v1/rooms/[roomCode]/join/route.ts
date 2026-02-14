import { NextRequest, NextResponse } from "next/server";
import type { JoinRoomRequest, JoinRoomResponse } from "@/lib/protocol/types";
import { readJson } from "@/lib/server/http";
import { gameStore } from "@/lib/server/game-store";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { roomCode: string } },
) {
  try {
    const body = await readJson<JoinRoomRequest>(request);
    const roomCode = params.roomCode.toUpperCase();
    const joined = gameStore.joinRoom(roomCode, body.playerDisplayName ?? "Player");

    const response: JoinRoomResponse = {
      roomCode,
      playerId: joined.playerId,
      playerToken: joined.playerToken,
      availableSeats: joined.availableSeats,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
