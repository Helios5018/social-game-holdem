import crypto from "node:crypto";
import type { RoomState } from "@/lib/server/room-types";
import { logServer } from "@/lib/server/logger";
import { gameStore, setAfterStateChangeHook } from "@/lib/server/game-store";
import { aiManager } from "./ai-manager";
import { fallbackDecision, makeDecision } from "./decision-engine";

const AI_DELAY_MS = 1_500;
const pendingDecisions = new Set<string>();
let schedulerConnected = false;

function pendingKey(roomCode: string, playerId: string): string {
  return `${roomCode.toUpperCase()}:${playerId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeActionId(): string {
  return crypto.randomUUID();
}

async function runDecision(room: RoomState, playerId: string): Promise<void> {
  const key = pendingKey(room.roomCode, playerId);

  try {
    await sleep(AI_DELAY_MS);

    if (room.status !== "in_hand" || room.hand?.toActPlayerId !== playerId) {
      return;
    }

    const config = aiManager.getConfig(room.roomCode, playerId);
    if (!config || !aiManager.isAiPlayer(room.roomCode, playerId)) {
      return;
    }

    gameStore.touchPresence(room.roomCode, config.token);

    const allowed = gameStore.computeAllowedActions(room, playerId);
    const command = await makeDecision(room, playerId, config, allowed);
    gameStore.applyAction(room.roomCode, config.token, command);
  } catch (error) {
    logServer({
      level: "warn",
      scope: "system",
      roomCode: room.roomCode,
      event: "ai_decision_failed",
      message: error instanceof Error ? error.message : "AI decision failed",
      meta: {
        playerId,
      },
    });

    try {
      if (room.status !== "in_hand" || room.hand?.toActPlayerId !== playerId) {
        return;
      }
      const config = aiManager.getConfig(room.roomCode, playerId);
      if (!config || !aiManager.isAiPlayer(room.roomCode, playerId)) {
        return;
      }
      const allowed = gameStore.computeAllowedActions(room, playerId);
      const fallback = fallbackDecision(allowed);
      gameStore.applyAction(room.roomCode, config.token, {
        actionId: makeActionId(),
        type: fallback.type,
        amount: fallback.amount,
      });
    } catch (fallbackError) {
      logServer({
        level: "error",
        scope: "system",
        roomCode: room.roomCode,
        event: "ai_fallback_failed",
        message:
          fallbackError instanceof Error ? fallbackError.message : "AI fallback decision failed",
        meta: {
          playerId,
        },
      });
    }
  } finally {
    pendingDecisions.delete(key);
  }
}

export function scheduleAiActionIfNeeded(room: RoomState): void {
  const playerId = room.hand?.toActPlayerId;
  if (room.status !== "in_hand" || !playerId) {
    return;
  }

  if (!aiManager.isAiPlayer(room.roomCode, playerId)) {
    return;
  }

  const key = pendingKey(room.roomCode, playerId);
  if (pendingDecisions.has(key)) {
    return;
  }

  pendingDecisions.add(key);
  void runDecision(room, playerId);
}

export function ensureAiSchedulerConnected(): void {
  if (schedulerConnected) {
    return;
  }

  setAfterStateChangeHook((room) => {
    scheduleAiActionIfNeeded(room);
  });

  schedulerConnected = true;
}
