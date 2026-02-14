"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "@/lib/protocol/types";
import { fetchSnapshot } from "./api";

export function useRoomSnapshot(roomCode: string, token?: string) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    try {
      const next = await fetchSnapshot(roomCode, token);
      setSnapshot((current) => {
        if (!current || next.version >= current.version) {
          return next;
        }
        return current;
      });
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to refresh room";
      setError(message);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [roomCode, token]);

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    refresh();

    const interval = setInterval(refresh, 1200);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    snapshot,
    loading,
    error,
    refresh,
  };
}
