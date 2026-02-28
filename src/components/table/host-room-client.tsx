"use client";

import { useEffect, useState } from "react";
import {
  addAiPlayer,
  listAiPlayers,
  rechargePlayer,
  removeAiPlayer,
  startHand,
  updateAiPersonality,
} from "@/lib/client/api";
import { getHostToken } from "@/lib/client/tokens";
import { usePresencePing } from "@/lib/client/use-presence-ping";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import type { AiPlayerInfo } from "@/lib/protocol/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoomTable } from "./room-table";
import { HostSystemLogPanel } from "./host-system-log-panel";
import { ShowdownPanel } from "./showdown-panel";
import styles from "./host-room-client.module.css";

interface HostRoomClientProps {
  roomCode: string;
}

const RECHARGE_STEP = 5;

type PersonalityPreset = "aggressive" | "conservative" | "balanced" | "custom";

interface PersonalityDraft {
  preset: PersonalityPreset;
  custom: string;
}

function normalizeRechargeInput(rawValue: string, allowZero = true): string {
  const parsed = Math.floor(Number(rawValue));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return allowZero ? "0" : String(RECHARGE_STEP);
  }

  const snapped = Math.round(parsed / RECHARGE_STEP) * RECHARGE_STEP;
  return String(Math.max(RECHARGE_STEP, snapped));
}

function draftFromPersonality(personality: string): PersonalityDraft {
  const normalized = personality.trim().toLowerCase();
  if (normalized === "aggressive" || normalized === "conservative" || normalized === "balanced") {
    return {
      preset: normalized,
      custom: "",
    };
  }

  return {
    preset: "custom",
    custom: personality,
  };
}

function resolveDraftPersonality(draft: PersonalityDraft): string {
  if (draft.preset === "custom") {
    return draft.custom.trim();
  }
  return draft.preset;
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

  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiPlayers, setAiPlayers] = useState<AiPlayerInfo[]>([]);
  const [aiDrafts, setAiDrafts] = useState<Record<string, PersonalityDraft>>({});
  const [aiName, setAiName] = useState("AI");
  const [aiPersonalityDraft, setAiPersonalityDraft] = useState<PersonalityDraft>({
    preset: "balanced",
    custom: "",
  });
  const [aiInitialChips, setAiInitialChips] = useState("500");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRowBusyPlayerId, setAiRowBusyPlayerId] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  useEffect(() => {
    setToken(getHostToken(roomCode));
  }, [roomCode]);

  usePresencePing(roomCode, token ?? undefined);

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

  const refreshAiPlayers = async (safeToken: string) => {
    try {
      const items = await listAiPlayers({ roomCode, token: safeToken });
      setAiPlayers(items);
      setAiDrafts((current) => {
        const next: Record<string, PersonalityDraft> = {};
        for (const item of items) {
          next[item.playerId] = current[item.playerId] ?? draftFromPersonality(item.personality);
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.ai.loadFailed"));
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    void refreshAiPlayers(token);
  }, [token, roomCode]);

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

  const onAddAiPlayer = async () => {
    if (!token || !snapshot) {
      return;
    }

    if (snapshot.status === "in_hand") {
      setError(t("host.ai.disabledInHand"));
      return;
    }

    const personality = resolveDraftPersonality(aiPersonalityDraft);
    if (!personality) {
      setError(t("host.ai.customRequired"));
      return;
    }

    const initialChips = Number(normalizeRechargeInput(aiInitialChips, false));
    if (initialChips <= 0) {
      setError(t("host.ai.chipsRequired"));
      return;
    }

    setAiBusy(true);
    setError(null);
    setAiFeedback(null);

    try {
      await addAiPlayer({
        roomCode,
        token,
        displayName: aiName.trim() || "AI",
        personality,
        initialChips,
      });
      setAiFeedback(t("host.ai.addSuccess"));
      setAiName("AI");
      setAiPersonalityDraft({ preset: "balanced", custom: "" });
      setAiInitialChips("500");
      await Promise.all([refreshAiPlayers(token), refresh()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.ai.addFailed"));
    } finally {
      setAiBusy(false);
    }
  };

  const updateAiDraft = (playerId: string, patch: Partial<PersonalityDraft>) => {
    setAiDrafts((current) => ({
      ...current,
      [playerId]: {
        ...(current[playerId] ?? { preset: "balanced", custom: "" }),
        ...patch,
      },
    }));
  };

  const onUpdateAiPersonality = async (playerId: string) => {
    if (!token) {
      return;
    }

    const draft = aiDrafts[playerId] ?? { preset: "balanced", custom: "" };
    const personality = resolveDraftPersonality(draft);
    if (!personality) {
      setError(t("host.ai.customRequired"));
      return;
    }

    setAiRowBusyPlayerId(playerId);
    setError(null);
    setAiFeedback(null);
    try {
      const updated = await updateAiPersonality({
        roomCode,
        token,
        playerId,
        personality,
      });
      setAiPlayers((current) =>
        current.map((item) => (item.playerId === playerId ? updated : item)),
      );
      setAiFeedback(t("host.ai.updateSuccess"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.ai.updateFailed"));
    } finally {
      setAiRowBusyPlayerId(null);
    }
  };

  const onRemoveAiPlayer = async (playerId: string) => {
    if (!token || !snapshot) {
      return;
    }

    if (snapshot.status === "in_hand") {
      setError(t("host.ai.disabledInHand"));
      return;
    }

    setAiRowBusyPlayerId(playerId);
    setError(null);
    setAiFeedback(null);
    try {
      await removeAiPlayer({
        roomCode,
        token,
        playerId,
      });
      setAiFeedback(t("host.ai.removeSuccess"));
      await Promise.all([refreshAiPlayers(token), refresh()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("host.ai.removeFailed"));
    } finally {
      setAiRowBusyPlayerId(null);
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
          <h2>{t("host.ai.title")}</h2>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setAiExpanded((current) => !current)}
            aria-expanded={aiExpanded}
          >
            {aiExpanded ? t("host.section.collapse") : t("host.section.expand")}
          </button>
        </div>

        {!aiExpanded ? <p className={styles.meta}>{t("host.ai.collapsedHint")}</p> : null}
        {!aiExpanded ? null : (
          <>
            {snapshot.status === "in_hand" ? <p className={styles.meta}>{t("host.ai.disabledInHand")}</p> : null}

            <div className={styles.aiCreateGrid}>
              <label className={styles.rechargeLabel}>
                {t("host.ai.name")}
                <input
                  type="text"
                  value={aiName}
                  onChange={(event) => setAiName(event.target.value)}
                  disabled={snapshot.status === "in_hand" || aiBusy}
                />
              </label>

              <label className={styles.rechargeLabel}>
                {t("host.ai.personality")}
                <select
                  value={aiPersonalityDraft.preset}
                  onChange={(event) =>
                    setAiPersonalityDraft((current) => ({
                      ...current,
                      preset: event.target.value as PersonalityPreset,
                    }))
                  }
                  disabled={snapshot.status === "in_hand" || aiBusy}
                >
                  <option value="aggressive">{t("host.ai.personality.aggressive")}</option>
                  <option value="conservative">{t("host.ai.personality.conservative")}</option>
                  <option value="balanced">{t("host.ai.personality.balanced")}</option>
                  <option value="custom">{t("host.ai.personality.custom")}</option>
                </select>
              </label>

              {aiPersonalityDraft.preset === "custom" ? (
                <label className={styles.rechargeLabel}>
                  {t("host.ai.customPersonality")}
                  <input
                    type="text"
                    value={aiPersonalityDraft.custom}
                    onChange={(event) =>
                      setAiPersonalityDraft((current) => ({
                        ...current,
                        custom: event.target.value,
                      }))
                    }
                    disabled={snapshot.status === "in_hand" || aiBusy}
                  />
                </label>
              ) : null}

              <label className={styles.rechargeLabel}>
                {t("host.ai.initialChips")}
                <input
                  type="number"
                  min={RECHARGE_STEP}
                  step={RECHARGE_STEP}
                  value={aiInitialChips}
                  onChange={(event) => setAiInitialChips(event.target.value)}
                  onBlur={() => setAiInitialChips((current) => normalizeRechargeInput(current, false))}
                  disabled={snapshot.status === "in_hand" || aiBusy}
                />
              </label>

              <button
                type="button"
                onClick={onAddAiPlayer}
                className={styles.aiPrimaryButton}
                disabled={snapshot.status === "in_hand" || aiBusy}
              >
                {t("host.ai.addButton")}
              </button>
            </div>

            {aiPlayers.length === 0 ? <p className={styles.meta}>{t("host.ai.empty")}</p> : null}

            {aiPlayers.length > 0 ? (
              <div className={styles.rechargeGrid}>
                {aiPlayers.map((player) => {
                  const seated = snapshot.players.find((item) => item.playerId === player.playerId);
                  const draft = aiDrafts[player.playerId] ?? draftFromPersonality(player.personality);
                  const rowBusy = aiRowBusyPlayerId === player.playerId;

                  return (
                    <div key={player.playerId} className={styles.rechargeRow}>
                      <div className={styles.rechargeIdentity}>
                        <strong>{player.displayName}</strong>
                        <span className={styles.meta}>
                          {seated ? `S${seated.seatNo + 1} · ${t("table.chips", { chips: seated.stack })}` : "-"}
                        </span>
                      </div>

                      <div className={styles.aiRowControls}>
                        <label className={styles.rechargeLabel}>
                          {t("host.ai.personality")}
                          <select
                            value={draft.preset}
                            onChange={(event) =>
                              updateAiDraft(player.playerId, {
                                preset: event.target.value as PersonalityPreset,
                              })
                            }
                            disabled={rowBusy}
                          >
                            <option value="aggressive">{t("host.ai.personality.aggressive")}</option>
                            <option value="conservative">{t("host.ai.personality.conservative")}</option>
                            <option value="balanced">{t("host.ai.personality.balanced")}</option>
                            <option value="custom">{t("host.ai.personality.custom")}</option>
                          </select>
                        </label>

                        {draft.preset === "custom" ? (
                          <label className={styles.rechargeLabel}>
                            {t("host.ai.customPersonality")}
                            <input
                              type="text"
                              value={draft.custom}
                              onChange={(event) =>
                                updateAiDraft(player.playerId, {
                                  custom: event.target.value,
                                })
                              }
                              disabled={rowBusy}
                            />
                          </label>
                        ) : null}

                        <div className={styles.aiRowActions}>
                          <button
                            type="button"
                            onClick={() => onUpdateAiPersonality(player.playerId)}
                            disabled={rowBusy}
                          >
                            {t("host.ai.updateButton")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveAiPlayer(player.playerId)}
                            disabled={rowBusy || snapshot.status === "in_hand"}
                          >
                            {t("host.ai.removeButton")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {aiFeedback ? <p className={styles.success}>{aiFeedback}</p> : null}
          </>
        )}
      </section>

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
