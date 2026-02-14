import { NextRequest, NextResponse } from "next/server";
import type { JoinRoomRequest, JoinRoomResponse } from "@/lib/protocol/types";
import { readJson } from "@/lib/server/http";
import { gameStore } from "@/lib/server/game-store";
import { withApiLogging } from "@/lib/server/with-api-logging";

export const runtime = "nodejs";

export const POST = withApiLogging(
  {
    event: "join_room",
    defaultErrorMessage: "Failed to join room",
    resolveRoomCode: (_request, context: { params: { roomCode: string } }) =>
      context.params.roomCode.toUpperCase(),
  },
  async (request: NextRequest, { params }: { params: { roomCode: string } }) => {
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
  },
);
