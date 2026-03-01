import type { AiPlayerInfo } from "@/lib/protocol/types";
import type { AiPlayerConfig } from "./ai-types";

declare global {
  // eslint-disable-next-line no-var
  var __holdemAiRooms: Map<string, Map<string, AiPlayerConfig>> | undefined;
}

const sharedAiRooms = global.__holdemAiRooms ?? new Map<string, Map<string, AiPlayerConfig>>();
global.__holdemAiRooms = sharedAiRooms;

class AiManager {
  private readonly rooms = sharedAiRooms;

  register(config: AiPlayerConfig): void {
    const roomCode = config.roomCode.toUpperCase();
    const roomMap = this.rooms.get(roomCode) ?? new Map<string, AiPlayerConfig>();
    roomMap.set(config.playerId, {
      ...config,
      roomCode,
    });
    this.rooms.set(roomCode, roomMap);
  }

  unregister(roomCode: string, playerId: string): boolean {
    const roomMap = this.rooms.get(roomCode.toUpperCase());
    if (!roomMap) {
      return false;
    }

    const removed = roomMap.delete(playerId);
    if (roomMap.size === 0) {
      this.rooms.delete(roomCode.toUpperCase());
    }
    return removed;
  }

  isAiPlayer(roomCode: string, playerId: string): boolean {
    return this.rooms.get(roomCode.toUpperCase())?.has(playerId) ?? false;
  }

  getConfig(roomCode: string, playerId: string): AiPlayerConfig | null {
    return this.rooms.get(roomCode.toUpperCase())?.get(playerId) ?? null;
  }

  listAllConfigs(): AiPlayerConfig[] {
    const items: AiPlayerConfig[] = [];
    this.rooms.forEach((roomMap) => {
      roomMap.forEach((config) => items.push(config));
    });
    return items;
  }

  listForRoom(roomCode: string): AiPlayerInfo[] {
    const roomMap = this.rooms.get(roomCode.toUpperCase());
    if (!roomMap) {
      return [];
    }

    return Array.from(roomMap.values()).map((item) => ({
      roomCode: item.roomCode,
      playerId: item.playerId,
      displayName: item.displayName,
      personality: item.personality,
    }));
  }

  updatePersonality(roomCode: string, playerId: string, personality: string): AiPlayerConfig {
    const roomMap = this.rooms.get(roomCode.toUpperCase());
    const current = roomMap?.get(playerId);
    if (!roomMap || !current) {
      throw new Error("AI player not found");
    }

    const next = {
      ...current,
      personality: personality.trim() || "balanced",
    };
    roomMap.set(playerId, next);
    return next;
  }
}

export const aiManager = new AiManager();
