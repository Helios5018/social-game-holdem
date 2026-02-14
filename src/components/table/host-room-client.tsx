"use client";

import { useEffect, useState } from "react";
import { startHand } from "@/lib/client/api";
import { getHostToken } from "@/lib/client/tokens";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoomTable } from "./room-table";
import styles from "./host-room-client.module.css";

interface HostRoomClientProps {
  roomCode: string;
}

export function HostRoomClient({ roomCode }: HostRoomClientProps) {
  const { t, language } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(getHostToken(roomCode));
  }, [roomCode]);

  const { snapshot, loading, refresh } = useRoomSnapshot(roomCode, token ?? undefined);

  const statusLabel = (status: string): string => {
    if (language === "zh") {
      return status === "in_hand" ? "进行中" : "等待中";
    }
    return status === "in_hand" ? "In Hand" : "Waiting";
  };

  const streetLabel = (street: string | null): string => {
    if (!street) {
      return "-";
    }

    if (language === "zh") {
      const map: Record<string, string> = {
        preflop: "翻牌前",
        flop: "翻牌",
        turn: "转牌",
        river: "河牌",
        showdown: "摊牌",
        settled: "已结算",
      };
      return map[street] ?? street;
    }

    return street;
  };

  const onStartHand = async () => {
    if (!token) {
      setError(t("host.tokenMissing"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await startHand(roomCode, token);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.startHandFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className={styles.main}>
        <h1>{t("host.title", { roomCode })}</h1>
        <p>{t("host.tokenMissing")}</p>
      </main>
    );
  }

  if (loading || !snapshot) {
    return (
      <main className={styles.main}>
        <h1>{t("host.title", { roomCode })}</h1>
        <p>{t("host.loading")}</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>{t("host.title", { roomCode: snapshot.roomCode })}</h1>
          <p>
            {t("host.status", {
              status: statusLabel(snapshot.status),
              handNo: snapshot.handNo,
              street: streetLabel(snapshot.street),
            })}
          </p>
          <p>
            {t("host.blinds", {
              smallBlind: snapshot.smallBlind,
              bigBlind: snapshot.bigBlind,
            })}
          </p>
        </div>
        <button type="button" onClick={onStartHand} disabled={busy || snapshot.status === "in_hand"}>
          {t("host.startHand")}
        </button>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      <RoomTable
        communityCards={snapshot.communityCards}
        players={snapshot.players}
        totalPot={snapshot.pot}
        pots={snapshot.pots}
        hasSidePot={snapshot.hasSidePot}
        version={snapshot.version}
        highlightPlayerId={snapshot.players.find((player) => player.isTurn)?.playerId ?? null}
        showEligibleNames
      />

      {snapshot.results.length > 0 ? (
        <section className={styles.panel}>
          <h2>{t("host.lastResults")}</h2>
          <ul>
            {snapshot.results.map((result, index) => (
              <li key={`${result.reason}-${index}`}>
                {t("host.resultLine", {
                  reason: result.reason,
                  amount: result.amount,
                  winners: result.winnerPlayerIds
                    .map(
                      (playerId) =>
                        snapshot.players.find((player) => player.playerId === playerId)?.displayName ??
                        playerId,
                    )
                    .join(", "),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2>{t("host.actionLog")}</h2>
        <ul>
          {snapshot.actionLog.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
