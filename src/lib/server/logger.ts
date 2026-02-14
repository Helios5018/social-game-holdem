import crypto from "node:crypto";
import type {
  ServerLogEntry,
  ServerLogLevel,
  ServerLogScope,
} from "@/lib/protocol/types";

const LEVEL_PRIORITY: Record<ServerLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: ServerLogLevel = "info";
const DEFAULT_GLOBAL_BUFFER = 500;
const DEFAULT_ROOM_BUFFER = 200;
const MAX_META_VALUE_LENGTH = 200;
const GLOBAL_ALERT_LIMIT = 20;

type LogMeta = Record<string, string | number | boolean | null | undefined>;

interface InternalLogEntry extends ServerLogEntry {
  seq: number;
}

interface QueryOptions {
  roomCode?: string;
  levels?: ServerLogLevel[];
  since?: string;
  limit?: number;
  includeGlobalAlerts?: boolean;
}

function parseLevel(input: string | undefined): ServerLogLevel {
  if (input === "debug" || input === "info" || input === "warn" || input === "error") {
    return input;
  }
  return DEFAULT_LEVEL;
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function trimArray<T>(items: T[], max: number): void {
  if (items.length <= max) {
    return;
  }
  items.splice(0, items.length - max);
}

function normalizeRoomCode(roomCode?: string): string | undefined {
  const normalized = roomCode?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

function sanitizeMeta(meta?: LogMeta): Record<string, string | number | boolean | null> | undefined {
  if (!meta) {
    return undefined;
  }

  const safe: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(meta)) {
    if (rawValue === undefined) {
      continue;
    }

    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    const lowered = key.toLowerCase();
    if (
      lowered.includes("token") ||
      lowered.includes("authorization") ||
      lowered.includes("secret") ||
      lowered.includes("password")
    ) {
      safe[key] = "[redacted]";
      continue;
    }

    if (typeof rawValue === "string") {
      safe[key] =
        rawValue.length > MAX_META_VALUE_LENGTH
          ? `${rawValue.slice(0, MAX_META_VALUE_LENGTH)}…`
          : rawValue;
      continue;
    }

    if (
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue === null
    ) {
      safe[key] = rawValue;
    }
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

class LoggerStore {
  private readonly level = parseLevel(process.env.LOG_LEVEL);
  private readonly globalMax = parsePositiveInt(process.env.LOG_BUFFER_GLOBAL, DEFAULT_GLOBAL_BUFFER);
  private readonly roomMax = parsePositiveInt(process.env.LOG_BUFFER_PER_ROOM, DEFAULT_ROOM_BUFFER);
  private readonly globalBuffer: InternalLogEntry[] = [];
  private readonly roomBuffer = new Map<string, InternalLogEntry[]>();
  private sequence = 0;

  shouldLog(level: ServerLogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  write(input: {
    level: ServerLogLevel;
    scope: ServerLogScope;
    event: string;
    message: string;
    roomCode?: string;
    requestId?: string;
    meta?: LogMeta;
  }): ServerLogEntry | null {
    if (!this.shouldLog(input.level)) {
      return null;
    }

    this.sequence += 1;
    const seq = this.sequence;
    const ts = new Date().toISOString();
    const roomCode = normalizeRoomCode(input.roomCode);
    const entry: InternalLogEntry = {
      seq,
      id: String(seq),
      ts,
      level: input.level,
      scope: input.scope,
      event: input.event,
      message: input.message,
      roomCode,
      requestId: input.requestId,
      meta: sanitizeMeta(input.meta),
    };

    this.globalBuffer.push(entry);
    trimArray(this.globalBuffer, this.globalMax);

    if (roomCode) {
      const roomLogs = this.roomBuffer.get(roomCode) ?? [];
      roomLogs.push(entry);
      trimArray(roomLogs, this.roomMax);
      this.roomBuffer.set(roomCode, roomLogs);
    }

    this.writeConsole(entry);
    return entry;
  }

  query(options: QueryOptions): { items: ServerLogEntry[]; nextCursor: string | null } {
    const levels = new Set(options.levels ?? ["info", "warn", "error"]);
    const since = Number.parseInt(options.since ?? "", 10);
    const sinceSeq = Number.isFinite(since) ? since : 0;
    const limit = Math.max(1, Math.min(options.limit ?? 100, this.roomMax));

    const roomCode = normalizeRoomCode(options.roomCode);
    const base = roomCode ? this.roomBuffer.get(roomCode) ?? [] : this.globalBuffer;
    const results = base.filter((entry) => entry.seq > sinceSeq && levels.has(entry.level));

    if (options.includeGlobalAlerts && roomCode) {
      const seen = new Set(results.map((entry) => entry.id));
      const globalAlerts = this.globalBuffer
        .filter(
          (entry) =>
            entry.seq > sinceSeq &&
            (entry.level === "warn" || entry.level === "error") &&
            entry.roomCode !== roomCode,
        )
        .slice(-GLOBAL_ALERT_LIMIT);

      for (const item of globalAlerts) {
        if (!seen.has(item.id) && levels.has(item.level)) {
          results.push(item);
        }
      }
    }

    results.sort((left, right) => left.seq - right.seq);
    const bounded = results.slice(-limit);
    const nextCursor = bounded.length > 0 ? bounded[bounded.length - 1].id : options.since ?? null;

    return {
      items: bounded.map(({ seq: _seq, ...entry }) => entry),
      nextCursor,
    };
  }

  allowDebugInUi(): boolean {
    return process.env.LOG_INCLUDE_DEBUG_IN_UI === "true";
  }

  private writeConsole(entry: ServerLogEntry): void {
    const payload = {
      ts: entry.ts,
      level: entry.level,
      scope: entry.scope,
      roomCode: entry.roomCode,
      event: entry.event,
      message: entry.message,
      requestId: entry.requestId,
      meta: entry.meta,
    };

    const line = `[holdem] ${JSON.stringify(payload)}`;
    if (entry.level === "error") {
      console.error(line);
      return;
    }
    if (entry.level === "warn") {
      console.warn(line);
      return;
    }
    if (entry.level === "debug") {
      console.debug(line);
      return;
    }
    console.log(line);
  }
}

const instance = new LoggerStore();

export function createRequestId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function logServer(input: {
  level: ServerLogLevel;
  scope: ServerLogScope;
  event: string;
  message: string;
  roomCode?: string;
  requestId?: string;
  meta?: LogMeta;
}): ServerLogEntry | null {
  return instance.write(input);
}

export function queryServerLogs(options: QueryOptions): {
  items: ServerLogEntry[];
  nextCursor: string | null;
} {
  return instance.query(options);
}

export function allowDebugLogsInUi(): boolean {
  return instance.allowDebugInUi();
}
