"use client";

import { useEffect, useState } from "react";
import { rechargePlayer, startHand } from "@/lib/client/api";
import { getHostToken } from "@/lib/client/tokens";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoomTable } from "./room-table";
import { HostSystemLogPanel } from "./host-system-log-panel";
import { ShowdownPanel } from "./showdown-panel";
import styles from "./host-room-client.module.css";

interface HostRoomClientProps {
  roomCode: string;
}

const RECHARGE_STEP = 5;

function normalizeRechargeInput(rawValue: string, allowZero = true): string {
  const parsed = Math.floor(Number(rawValue));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return allowZero ? "0" : String(RECHARGE_STEP);
  }

  const snapped = Math.round(parsed / RECHARGE_STEP) * RECHARGE_STEP;
  return String(Math.max(RECHARGE_STEP, snapped));
}

export function HostRoomClient({ roomCode }: HostRoomClientProps) {
  const { t, language } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rechargeBusyPlayerId, setRechargeBusyPlayerId] = useState<string | null>(null);
  const [rechargeInputs, setRechargeInputs] = useState<Record<string, string>>({});
  const [rechargeFeedback, setRechargeFeedback] = useState<string | null>(null);
  const [rechargeExpanded, setRechargeExpanded] = useState(false);
  const [actionLogExpanded, setActionLogExpanded] = useState(false);

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
      const message = caught instanceof Error ? caught.message : t("host.startHandFailed");
      setError(
        message === "All seated players must have chips before starting a hand"
          ? t("host.startHandInvalidStack")
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const updateRechargeInput = (playerId: string, value: string) => {
    setRechargeInputs((current) => ({
      ...current,
      [playerId]: value,
    }));
  };

  const normalizeRechargeForPlayer = (playerId: string) => {
    setRechargeInputs((current) => {
      const normalized = normalizeRechargeInput(current[playerId] ?? "0", true);
      if (current[playerId] === normalized) {
        return current;
      }

      return {
        ...current,
        [playerId]: normalized,
      };
    });
  };

  const onRecharge = async (playerId: string, displayName: string) => {
    if (!token || !snapshot) {
      return;
    }

    const normalizedAmount = Number(normalizeRechargeInput(rechargeInputs[playerId] ?? "0", true));
    updateRechargeInput(playerId, String(normalizedAmount));
    if (normalizedAmount <= 0) {
      setError(t("host.recharge.amountRequired"));
      setRechargeFeedback(null);
      return;
    }

    setRechargeBusyPlayerId(playerId);
    setError(null);
    setRechargeFeedback(null);
    try {
      await rechargePlayer({
        roomCode,
        token,
        playerId,
        amount: normalizedAmount,
      });
      updateRechargeInput(playerId, "0");
      setRechargeFeedback(t("host.recharge.success", { player: displayName, amount: normalizedAmount }));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.recharge.failed"));
    } finally {
      setRechargeBusyPlayerId(null);
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

      {snapshot.lastShowdown ? (
        <section className={styles.panel}>
          <ShowdownPanel detail={snapshot.lastShowdown} />
        </section>
      ) : null}

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
        <div className={styles.panelHeaderRow}>
          <h2>{t("host.recharge.title")}</h2>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setRechargeExpanded((current) => !current)}
            aria-expanded={rechargeExpanded}
          >
            {rechargeExpanded ? t("host.section.collapse") : t("host.section.expand")}
          </button>
        </div>

        {!rechargeExpanded ? <p className={styles.meta}>{t("host.recharge.collapsedHint")}</p> : null}
        {!rechargeExpanded ? null : (
          <>
            {snapshot.status === "in_hand" ? (
              <p className={styles.meta}>{t("host.recharge.disabledInHand")}</p>
            ) : null}
            {snapshot.players.length === 0 ? <p className={styles.meta}>{t("host.recharge.empty")}</p> : null}

            {snapshot.players.length > 0 ? (
              <div className={styles.rechargeGrid}>
                {snapshot.players.map((player) => (
                  <div key={player.playerId} className={styles.rechargeRow}>
                    <div className={styles.rechargeIdentity}>
                      <strong>{player.displayName}</strong>
                      <span className={styles.meta}>
                        S{player.seatNo + 1} · {t("table.chips", { chips: player.stack })}
                      </span>
                    </div>
                    <div className={styles.rechargeControls}>
                      <label className={styles.rechargeLabel}>
                        {t("host.recharge.amount")}
                        <input
                          type="number"
                          min={0}
                          step={RECHARGE_STEP}
                          value={rechargeInputs[player.playerId] ?? "0"}
                          onChange={(event) => updateRechargeInput(player.playerId, event.target.value)}
                          onBlur={() => normalizeRechargeForPlayer(player.playerId)}
                          disabled={snapshot.status === "in_hand" || rechargeBusyPlayerId === player.playerId}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onRecharge(player.playerId, player.displayName)}
                        disabled={snapshot.status === "in_hand" || rechargeBusyPlayerId !== null}
                      >
                        {t("host.recharge.button")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {rechargeFeedback ? <p className={styles.success}>{rechargeFeedback}</p> : null}
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeaderRow}>
          <h2>{t("host.actionLog")}</h2>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setActionLogExpanded((current) => !current)}
            aria-expanded={actionLogExpanded}
          >
            {actionLogExpanded ? t("host.section.collapse") : t("host.section.expand")}
          </button>
        </div>
        {!actionLogExpanded ? <p className={styles.meta}>{t("host.actionLog.collapsedHint")}</p> : null}
        {!actionLogExpanded ? null : (
          <ul>
            {snapshot.actionLog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <HostSystemLogPanel roomCode={snapshot.roomCode} token={token} />
    </main>
  );
}
