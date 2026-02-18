"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/client/api";
import { setHostToken, setPlayerToken } from "@/lib/client/tokens";
import { useLanguage } from "@/components/i18n/language-provider";
import styles from "./lobby-client.module.css";

const HOLD_EM_TUTORIAL_URL =
  "https://www.bilibili.com/video/BV1a94y1E7DT/?spm_id_from=333.337.search-card.all.click&vd_source=1bd43164f98f7ccbe05488f13604d342";
const HOLD_EM_TUTORIAL_EMBED_URL =
  "https://player.bilibili.com/player.html?bvid=BV1a94y1E7DT&page=1&high_quality=1&as_wide=1";

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

  const normalizeJoinCodeInput = (value: string): string => value.replace(/\D/g, "").slice(0, 4);

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
      const code = normalizeJoinCodeInput(joinCode.trim());
      if (code.length !== 4) {
        throw new Error("Room code must be 4 digits");
      }
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
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              onChange={(event) => setJoinCode(normalizeJoinCodeInput(event.target.value))}
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

      <section className={styles.tutorialPanel} aria-label={t("lobby.tutorialTitle")}>
        <h2>{t("lobby.tutorialTitle")}</h2>
        <p className={styles.tutorialSubtitle}>{t("lobby.tutorialSubtitle")}</p>
        <div className={styles.videoFrame}>
          <iframe
            src={HOLD_EM_TUTORIAL_EMBED_URL}
            title={t("lobby.tutorialTitle")}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <a
          className={styles.tutorialLink}
          href={HOLD_EM_TUTORIAL_URL}
          target="_blank"
          rel="noreferrer"
        >
          {t("lobby.tutorialFallback")}
        </a>
      </section>
    </main>
  );
}
