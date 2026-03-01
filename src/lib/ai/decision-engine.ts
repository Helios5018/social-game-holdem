import crypto from "node:crypto";
import type { AllowedActions, GameActionCommand, GameActionType } from "@/lib/protocol/types";
import type { RoomState } from "@/lib/server/room-types";
import type { AiDecision, AiPlayerConfig, LlmPokerResponse } from "./ai-types";
import { requestChatCompletion } from "./llm-client";
import { buildGameContext, buildSystemPrompt, buildUserPrompt } from "./prompt-builder";

const BET_STEP = 5;

const ACTIONS: GameActionType[] = ["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"];

export interface AiDecisionResult {
  command: GameActionCommand;
  source: "llm" | "fallback";
  reasoning?: string;
  durationMs: number;
  error?: string;
}

function makeActionId(): string {
  return crypto.randomUUID();
}

function normalizeAction(value: unknown): GameActionType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  return ACTIONS.includes(normalized as GameActionType) ? (normalized as GameActionType) : null;
}

function getSteppedRange(min: number, max: number): { min: number; max: number } | null {
  const steppedMin = Math.ceil(min / BET_STEP) * BET_STEP;
  const steppedMax = Math.floor(max / BET_STEP) * BET_STEP;
  if (steppedMax < steppedMin) {
    return null;
  }
  return { min: steppedMin, max: steppedMax };
}

function getBetRange(allowed: AllowedActions): { min: number; max: number } | null {
  if (!allowed.bet) {
    return null;
  }

  const max = Math.max(0, Math.floor(allowed.maxPut));
  if (max <= 0) {
    return null;
  }

  const minLegal = Math.max(BET_STEP, Math.min(allowed.minBet, max));
  return getSteppedRange(minLegal, max);
}

function getRaiseRange(
  room: RoomState,
  playerId: string,
  allowed: AllowedActions,
): { min: number; max: number } | null {
  if (!allowed.raise || !room.hand) {
    return null;
  }

  const contribution = room.hand.contributionsStreet[playerId] ?? 0;
  const max = Math.max(0, Math.floor(allowed.maxPut));
  if (max <= 0) {
    return null;
  }

  const minFullRaiseAmount = allowed.minRaiseTo - contribution;
  const minAllInRaise = allowed.toCall + BET_STEP;
  const minLegal = Math.max(minAllInRaise, Math.min(minFullRaiseAmount, max));
  return getSteppedRange(minLegal, max);
}

function actionAllowed(type: GameActionType, allowed: AllowedActions): boolean {
  if (type === "FOLD") {
    return allowed.fold;
  }
  if (type === "CHECK") {
    return allowed.check;
  }
  if (type === "CALL") {
    return allowed.call;
  }
  if (type === "BET") {
    return allowed.bet;
  }
  if (type === "RAISE") {
    return allowed.raise;
  }
  return allowed.allIn;
}

function toSizedDecision(
  type: "BET" | "RAISE",
  amount: unknown,
  range: { min: number; max: number } | null,
  allowed: AllowedActions,
): AiDecision {
  if (!range) {
    if (allowed.allIn) {
      return { type: "ALL_IN", reasoning: `${type} had no valid stepped amount, fallback to all-in.` };
    }
    return fallbackDecision(allowed);
  }

  const parsed = Math.floor(Number(amount));
  const seed = Number.isFinite(parsed) ? parsed : range.min;
  const bounded = Math.max(range.min, Math.min(range.max, seed));
  const snapped = Math.round(bounded / BET_STEP) * BET_STEP;
  const finalAmount = Math.max(range.min, Math.min(range.max, snapped));

  if (type === "RAISE" && finalAmount <= allowed.toCall) {
    if (allowed.call) {
      return { type: "CALL", reasoning: "Raise amount invalid after normalization, fallback to call." };
    }
    return fallbackDecision(allowed);
  }

  return {
    type,
    amount: finalAmount,
  };
}

export function parseResponse(raw: string): LlmPokerResponse {
  const text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]) as LlmPokerResponse;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as LlmPokerResponse;
  }

  return JSON.parse(text) as LlmPokerResponse;
}

export function sanitizeDecision(
  room: RoomState,
  playerId: string,
  parsed: LlmPokerResponse,
  allowed: AllowedActions,
): AiDecision {
  const type = normalizeAction(parsed.action);
  if (!type || !actionAllowed(type, allowed)) {
    return fallbackDecision(allowed);
  }

  if (type === "BET") {
    return {
      ...toSizedDecision("BET", parsed.amount, getBetRange(allowed), allowed),
      reasoning: parsed.reasoning,
    };
  }

  if (type === "RAISE") {
    return {
      ...toSizedDecision("RAISE", parsed.amount, getRaiseRange(room, playerId, allowed), allowed),
      reasoning: parsed.reasoning,
    };
  }

  return {
    type,
    reasoning: parsed.reasoning,
  };
}

export function fallbackDecision(allowed: AllowedActions): AiDecision {
  if (allowed.check) {
    return { type: "CHECK", reasoning: "Fallback: CHECK is available." };
  }
  return { type: "FOLD", reasoning: "Fallback: CHECK unavailable, folding." };
}

export async function makeDecision(
  room: RoomState,
  playerId: string,
  config: AiPlayerConfig,
  allowedActions: AllowedActions,
): Promise<AiDecisionResult> {
  const startedAt = Date.now();

  try {
    const systemPrompt = buildSystemPrompt(config);
    const context = buildGameContext(room, playerId, allowedActions);
    const userPrompt = buildUserPrompt(context, config.personality);

    const raw = await requestChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const parsed = parseResponse(raw);
    const decision = sanitizeDecision(room, playerId, parsed, allowedActions);
    return {
      command: {
        actionId: makeActionId(),
        type: decision.type,
        amount: decision.amount,
      },
      source: "llm",
      reasoning: decision.reasoning,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const decision: AiDecision = fallbackDecision(allowedActions);
    return {
      command: {
        actionId: makeActionId(),
        type: decision.type,
        amount: decision.amount,
      },
      source: "fallback",
      reasoning: decision.reasoning,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
