import type { GameActionType } from "@/lib/protocol/types";

export interface AiPlayerConfig {
  playerId: string;
  roomCode: string;
  displayName: string;
  personality: string;
  token: string;
}

export interface AiDecision {
  type: GameActionType;
  amount?: number;
  reasoning?: string;
}

export interface LlmPokerResponse {
  action: string;
  amount?: number;
  reasoning?: string;
}
