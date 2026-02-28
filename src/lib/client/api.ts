import type {
  AddAiPlayerRequest,
  AddAiPlayerResponse,
  AiPlayerInfo,
  BasicOkResponse,
  CreateRoomResponse,
  GameActionCommand,
  HostLogsResponse,
  JoinRoomResponse,
  ListAiPlayersResponse,
  PresencePingResponse,
  RechargePlayerRequest,
  RoomSnapshot,
  UpdateAiPersonalityRequest,
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
}): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/seat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<BasicOkResponse>(response);
}

export async function startHand(roomCode: string, token: string): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${roomCode}/host/start-hand`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await parseResponse<BasicOkResponse>(response);
}

export async function rechargePlayer(input: RechargePlayerRequest & { roomCode: string }): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/host/recharge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: input.token,
      playerId: input.playerId,
      amount: input.amount,
    }),
  });

  await parseResponse<BasicOkResponse>(response);
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

  await parseResponse<BasicOkResponse>(response);
}

export async function fetchSnapshot(roomCode: string, token?: string): Promise<RoomSnapshot> {
  const response = await fetch(`/api/v1/rooms/${roomCode}/snapshot`, {
    cache: "no-store",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

  return parseResponse<RoomSnapshot>(response);
}

export async function fetchHostLogs(input: {
  roomCode: string;
  token: string;
  since?: string;
  limit?: number;
  includeDebug?: boolean;
}): Promise<HostLogsResponse> {
  const params = new URLSearchParams();
  if (input.since) {
    params.set("since", input.since);
  }
  if (input.limit != null) {
    params.set("limit", String(input.limit));
  }
  if (input.includeDebug) {
    params.set("includeDebug", "true");
  }

  const query = params.toString();
  const response = await fetch(
    `/api/v1/rooms/${input.roomCode}/host/logs${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: { authorization: `Bearer ${input.token}` },
    },
  );

  return parseResponse<HostLogsResponse>(response);
}

export async function pingPresence(input: {
  roomCode: string;
  token: string;
}): Promise<PresencePingResponse> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/presence/ping`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: input.token }),
  });

  return parseResponse<PresencePingResponse>(response);
}

export async function addAiPlayer(
  input: AddAiPlayerRequest & { roomCode: string },
): Promise<AddAiPlayerResponse> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/host/ai-players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: input.token,
      displayName: input.displayName,
      personality: input.personality,
      initialChips: input.initialChips,
    }),
  });

  return parseResponse<AddAiPlayerResponse>(response);
}

export async function listAiPlayers(input: {
  roomCode: string;
  token: string;
}): Promise<AiPlayerInfo[]> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/host/ai-players`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${input.token}` },
  });

  const data = await parseResponse<ListAiPlayersResponse>(response);
  return data.items;
}

export async function updateAiPersonality(
  input: UpdateAiPersonalityRequest & { roomCode: string; playerId: string },
): Promise<AiPlayerInfo> {
  const response = await fetch(
    `/api/v1/rooms/${input.roomCode}/host/ai-players/${input.playerId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: input.token,
        personality: input.personality,
      }),
    },
  );

  return parseResponse<AiPlayerInfo>(response);
}

export async function removeAiPlayer(input: {
  roomCode: string;
  token: string;
  playerId: string;
}): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${input.roomCode}/host/ai-players/${input.playerId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: input.token,
    }),
  });

  await parseResponse<BasicOkResponse>(response);
}
