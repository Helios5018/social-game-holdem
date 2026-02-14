"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/client/api";
import { setHostToken, setPlayerToken } from "@/lib/client/tokens";
import { useLanguage } from "@/components/i18n/language-provider";
import styles from "./lobby-client.module.css";

export function LobbyClient() {
  const router = useRouter();
  const { t } = useLanguage();
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
      setError(caught instanceof Error ? caught.message : t("lobby.createFailed"));
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
      setError(caught instanceof Error ? caught.message : t("lobby.joinFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.main}>
      <h1>{t("lobby.title")}</h1>
      <p className={styles.subtitle}>{t("lobby.subtitle")}</p>

      <section className={styles.grid}>
        <form className={styles.panel} onSubmit={onCreate}>
          <h2>{t("lobby.hostPanel")}</h2>
          <label>
            {t("lobby.hostName")}
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} required />
          </label>
          <label>
            {t("lobby.smallBlind")}
            <input
              type="number"
              min={1}
              value={smallBlind}
              onChange={(event) => setSmallBlind(Number(event.target.value))}
              required
            />
          </label>
          <label>
            {t("lobby.bigBlind")}
            <input
              type="number"
              min={2}
              value={bigBlind}
              onChange={(event) => setBigBlind(Number(event.target.value))}
              required
            />
          </label>
          <button disabled={busy} type="submit">
            {t("lobby.createButton")}
          </button>
        </form>

        <form className={styles.panel} onSubmit={onJoin}>
          <h2>{t("lobby.playerPanel")}</h2>
          <label>
            {t("lobby.roomCode")}
            <input
              value={joinCode}
              maxLength={8}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              required
            />
          </label>
          <label>
            {t("lobby.playerName")}
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} required />
          </label>
          <button disabled={busy} type="submit">
            {t("lobby.joinButton")}
          </button>
        </form>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}
