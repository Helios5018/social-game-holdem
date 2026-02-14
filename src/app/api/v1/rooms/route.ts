import { NextRequest, NextResponse } from "next/server";
import type { CreateRoomRequest, CreateRoomResponse } from "@/lib/protocol/types";
import { readJson } from "@/lib/server/http";
import { gameStore } from "@/lib/server/game-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<CreateRoomRequest>(request);
    const created = gameStore.createRoom(body.hostDisplayName ?? "Host", body.smallBlind, body.bigBlind);

    const response: CreateRoomResponse = {
      roomCode: created.roomCode,
      roomId: created.roomId,
      hostToken: created.hostToken,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
