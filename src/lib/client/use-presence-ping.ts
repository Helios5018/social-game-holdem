"use client";

import { useEffect, useRef } from "react";
import { pingPresence } from "./api";

const PING_INTERVAL_MS = 3_000;

export function usePresencePing(roomCode: string, token?: string): void {
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    const runPing = async () => {
      if (cancelled || inflightRef.current) {
        return;
      }
      inflightRef.current = true;
      try {
        await pingPresence({ roomCode, token });
      } catch {
        // Snapshot polling handles UI errors; silent retry here keeps heartbeat lightweight.
      } finally {
        inflightRef.current = false;
      }
    };

    runPing();
    const timer = setInterval(runPing, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomCode, token]);
}
