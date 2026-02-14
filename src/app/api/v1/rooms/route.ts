import { NextRequest, NextResponse } from "next/server";
import type { CreateRoomRequest, CreateRoomResponse } from "@/lib/protocol/types";
import { readJson } from "@/lib/server/http";
import { gameStore } from "@/lib/server/game-store";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "create_room",
    defaultErrorMessage: "Failed to create room",
  },
  async (request: NextRequest) => {
    const body = await readJson<CreateRoomRequest>(request);
    const created = gameStore.createRoom(
      body.hostDisplayName ?? "Host",
      body.smallBlind,
      body.bigBlind,
    );

    const response: CreateRoomResponse = {
      roomCode: created.roomCode,
      roomId: created.roomId,
      hostToken: created.hostToken,
    };

    return NextResponse.json(response, { status: 201 });
  },
);
