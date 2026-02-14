import type {
  CreateRoomResponse,
  GameActionCommand,
  JoinRoomResponse,
  RoomSnapshot,
} from "@/lib/protocol/types";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}

export async function createRoom(input: {
  hostDisplayName: string;
  smallBlind: number;
  bigBlind: number;
}): Promise<CreateRoomResponse> {
  const response = await fetch("/api/v1/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<CreateRoomResponse>(response);
}

export async function joinRoom(roomCode: string, playerDisplayName: string): Promise<JoinRoomResponse> {
  const response = await fetch(`/api/v1/rooms/${roomCode}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerDisplayName }),
  });

  return parseResponse<JoinRoomResponse>(response);
}

export async function seatPlayer(input: {
  roomCode: string;
  token: string;
  seatNo: number;
  buyIn: number;
}): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/seat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function startHand(roomCode: string, token: string): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${roomCode}/host/start-hand`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function postAction(input: {
  roomCode: string;
  token: string;
  command: GameActionCommand;
}): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  await parseResponse<{ ok: boolean }>(response);
}

export async function fetchSnapshot(roomCode: string, token?: string): Promise<RoomSnapshot> {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const response = await fetch(`/api/v1/rooms/${roomCode}/snapshot${query}`, {
    cache: "no-store",
  });

  return parseResponse<RoomSnapshot>(response);
}
