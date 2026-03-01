import crypto from "node:crypto";
import type { RoomState } from "@/lib/server/room-types";
import { logServer } from "@/lib/server/logger";
import { gameStore, setAfterStateChangeHook } from "@/lib/server/game-store";
import { aiManager } from "./ai-manager";
import { fallbackDecision, makeDecision } from "./decision-engine";

const AI_DELAY_MS = 1_500;
const AI_HEARTBEAT_MS = 3_000;
const pendingDecisions = new Set<string>();
let schedulerConnected = false;
let presenceHeartbeatTimer: NodeJS.Timeout | null = null;

function modelName(): string {
  return process.env.AI_LLM_MODEL?.trim() || "gemini-3-flash-preview";
}

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

function trimText(value: string | undefined, max = 88): string | null {
  if (!value) {
    return null;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function formatAction(type: string, amount?: number): string {
  return amount == null ? type : `${type} ${amount}`;
}

function maintainAiPresence(): void {
  for (const config of aiManager.listAllConfigs()) {
    try {
      gameStore.touchPresence(config.roomCode, config.token);
    } catch {
      // AI state is in-memory only; ignore stale configs on room lifecycle mismatch.
    }
  }
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
    gameStore.appendActionLog(
      room.roomCode,
      `[AI] ${config.displayName} 开始决策（模型 ${modelName()}）`,
    );

    const allowed = gameStore.computeAllowedActions(room, playerId);
    const result = await makeDecision(room, playerId, config, allowed);
    const reasoning = trimText(result.reasoning);
    const error = trimText(result.error);
    const reasonPart = reasoning ? `；依据：${reasoning}` : "";
    const errorPart = error ? `；原因：${error}` : "";

    if (result.source === "llm") {
      gameStore.appendActionLog(
        room.roomCode,
        `[AI] ${config.displayName} 模型决策：${formatAction(result.command.type, result.command.amount)}（${result.durationMs}ms${reasonPart}）`,
      );
    } else {
      gameStore.appendActionLog(
        room.roomCode,
        `[AI] ${config.displayName} 模型调用失败，回退：${formatAction(result.command.type, result.command.amount)}（${result.durationMs}ms${errorPart}${reasonPart}）`,
      );
    }

    gameStore.applyAction(room.roomCode, config.token, result.command);
  } catch (error) {
    const config = aiManager.getConfig(room.roomCode, playerId);
    const displayName = config?.displayName ?? playerId;
    const message = error instanceof Error ? error.message : "AI decision failed";

    gameStore.appendActionLog(room.roomCode, `[AI] ${displayName} 决策执行异常：${message}`);
    logServer({
      level: "warn",
      scope: "system",
      roomCode: room.roomCode,
      event: "ai_decision_failed",
      message,
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
      gameStore.appendActionLog(
        room.roomCode,
        `[AI] ${config.displayName} 二次回退动作：${formatAction(fallback.type, fallback.amount)}`,
      );
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
      const config = aiManager.getConfig(room.roomCode, playerId);
      const displayName = config?.displayName ?? playerId;
      const message =
        fallbackError instanceof Error ? fallbackError.message : "AI fallback decision failed";
      gameStore.appendActionLog(room.roomCode, `[AI] ${displayName} 回退动作失败：${message}`);
    }
  } finally {
    pendingDecisions.delete(key);
    // If the same AI remains to act after a state transition, retry scheduling
    // once pending lock is released (prevents silent stalls).
    scheduleAiActionIfNeeded(room);
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

  maintainAiPresence();
  presenceHeartbeatTimer = setInterval(maintainAiPresence, AI_HEARTBEAT_MS);

  schedulerConnected = true;
}
