"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerLogEntry } from "@/lib/protocol/types";
import { fetchHostLogs } from "./api";

const MAX_UI_LOG_ITEMS = 300;

function mergeUnique(
  current: ServerLogEntry[],
  incoming: ServerLogEntry[],
): ServerLogEntry[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map<string, ServerLogEntry>();
  for (const item of current) {
    byId.set(item.id, item);
  }
  for (const item of incoming) {
    byId.set(item.id, item);
  }

  const merged = Array.from(byId.values()).sort(
    (left, right) => Number(left.id) - Number(right.id),
  );
  if (merged.length <= MAX_UI_LOG_ITEMS) {
    return merged;
  }
  return merged.slice(merged.length - MAX_UI_LOG_ITEMS);
}

export function useHostLogs(roomCode: string, token?: string, includeDebug = false) {
  const [logs, setLogs] = useState<ServerLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [allowDebug, setAllowDebug] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    try {
      const result = await fetchHostLogs({
        roomCode,
        token,
        since: cursor ?? undefined,
        limit: 120,
        includeDebug,
      });

      setLogs((current) => mergeUnique(current, result.items));
      setCursor(result.nextCursor);
      setAllowDebug(Boolean(result.allowDebug));
      setError(null);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to load host logs";
      setError(message);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [cursor, includeDebug, roomCode, token]);

  useEffect(() => {
    setLogs([]);
    setCursor(null);
    setAllowDebug(false);
    setError(null);
    setLoading(Boolean(token));
  }, [roomCode, token, includeDebug]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    refresh();
    const timer = setInterval(refresh, 1200);
    return () => clearInterval(timer);
  }, [refresh, token]);

  return useMemo(
    () => ({
      logs,
      allowDebug,
      loading,
      error,
      refresh,
    }),
    [logs, allowDebug, loading, error, refresh],
  );
}
