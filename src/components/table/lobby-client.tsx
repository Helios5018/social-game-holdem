"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/client/api";
import { setHostToken, setPlayerToken } from "@/lib/client/tokens";
import styles from "./lobby-client.module.css";

export function LobbyClient() {
  const router = useRouter();
  const [hostName, setHostName] = useState("Host");
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createRoom({
        hostDisplayName: hostName,
        smallBlind,
        bigBlind,
      });
      setHostToken(created.roomCode, created.hostToken);
      router.push(`/host/${created.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const code = joinCode.trim().toUpperCase();
      const joined = await joinRoom(code, playerName);
      setPlayerToken(joined.roomCode, joined.playerToken);
      router.push(`/play/${joined.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to join room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.main}>
      <h1>Social Hold&apos;em</h1>
      <p className={styles.subtitle}>Create a room for your host console or join from a phone.</p>

      <section className={styles.grid}>
        <form className={styles.panel} onSubmit={onCreate}>
          <h2>Create Room (Host)</h2>
          <label>
            Host Name
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} required />
          </label>
          <label>
            Small Blind
            <input
              type="number"
              min={1}
              value={smallBlind}
              onChange={(event) => setSmallBlind(Number(event.target.value))}
              required
            />
          </label>
          <label>
            Big Blind
            <input
              type="number"
              min={2}
              value={bigBlind}
              onChange={(event) => setBigBlind(Number(event.target.value))}
              required
            />
          </label>
          <button disabled={busy} type="submit">
            Create Host Room
          </button>
        </form>

        <form className={styles.panel} onSubmit={onJoin}>
          <h2>Join Room (Player)</h2>
          <label>
            Room Code
            <input
              value={joinCode}
              maxLength={8}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              required
            />
          </label>
          <label>
            Player Name
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} required />
          </label>
          <button disabled={busy} type="submit">
            Join as Player
          </button>
        </form>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}
