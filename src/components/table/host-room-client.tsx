"use client";

import { useEffect, useState } from "react";
import { startHand } from "@/lib/client/api";
import { getHostToken } from "@/lib/client/tokens";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import { RoomTable } from "./room-table";
import styles from "./host-room-client.module.css";

interface HostRoomClientProps {
  roomCode: string;
}

export function HostRoomClient({ roomCode }: HostRoomClientProps) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(getHostToken(roomCode));
  }, [roomCode]);

  const { snapshot, loading, refresh } = useRoomSnapshot(roomCode, token ?? undefined);

  const onStartHand = async () => {
    if (!token) {
      setError("Host token not found. Create a room from the lobby first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await startHand(roomCode, token);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start hand");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className={styles.main}>
        <h1>Host Console · {roomCode}</h1>
        <p>Host token is missing in this browser. Create the room from lobby to continue.</p>
      </main>
    );
  }

  if (loading || !snapshot) {
    return (
      <main className={styles.main}>
        <h1>Host Console · {roomCode}</h1>
        <p>Loading room...</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>Host Console · {snapshot.roomCode}</h1>
          <p>
            Status: <strong>{snapshot.status}</strong> · Hand #{snapshot.handNo} · Street: {snapshot.street ?? "-"}
          </p>
          <p>
            Blinds: {snapshot.smallBlind}/{snapshot.bigBlind} · Pot: {snapshot.pot}
          </p>
        </div>
        <button type="button" onClick={onStartHand} disabled={busy || snapshot.status === "in_hand"}>
          Start Hand
        </button>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      <RoomTable
        communityCards={snapshot.communityCards}
        players={snapshot.players}
        highlightPlayerId={snapshot.players.find((player) => player.isTurn)?.playerId ?? null}
      />

      {snapshot.results.length > 0 ? (
        <section className={styles.panel}>
          <h2>Last Results</h2>
          <ul>
            {snapshot.results.map((result, index) => (
              <li key={`${result.reason}-${index}`}>
                {result.reason}: {result.amount} chips to{" "}
                {result.winnerPlayerIds
                  .map(
                    (playerId) =>
                      snapshot.players.find((player) => player.playerId === playerId)?.displayName ??
                      playerId,
                  )
                  .join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2>Action Log</h2>
        <ul>
          {snapshot.actionLog.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
