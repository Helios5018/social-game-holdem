"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { postAction, seatPlayer } from "@/lib/client/api";
import { getPlayerToken } from "@/lib/client/tokens";
import { usePresencePing } from "@/lib/client/use-presence-ping";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import { PlayingCard } from "@/components/game/playing-card";
import type { GameActionType } from "@/lib/protocol/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoomTable } from "./room-table";
import { ShowdownPanel } from "./showdown-panel";
import styles from "./player-room-client.module.css";

interface PlayerRoomClientProps {
  roomCode: string;
}

function makeActionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clampToRange(value: number, min: number, max: number): number {
  const boundedMax = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(boundedMax, value));
}

const BET_STEP = 5;

function getStepRange(min: number, max: number, step: number): { min: number; max: number } | null {
  const stepMin = Math.ceil(min / step) * step;
  const stepMax = Math.floor(max / step) * step;
  return stepMax >= stepMin ? { min: stepMin, max: stepMax } : null;
}

function normalizeAmountOnBlur(
  rawValue: string,
  amountRange: { min: number; max: number } | null,
): string {
  if (!amountRange) {
    return rawValue;
  }

  const stepped = getStepRange(amountRange.min, amountRange.max, BET_STEP);
  if (!stepped) {
    return rawValue;
  }

  const parsed = Math.floor(Number(rawValue));
  const fallback = stepped.min;
  const candidate = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = clampToRange(candidate, stepped.min, stepped.max);
  const snapped = Math.round(bounded / BET_STEP) * BET_STEP;
  return String(clampToRange(snapped, stepped.min, stepped.max));
}

export function PlayerRoomClient({ roomCode }: PlayerRoomClientProps) {
  const { t, language } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedActionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setToken(getPlayerToken(roomCode));
  }, [roomCode]);

  usePresencePing(roomCode, token ?? undefined);

  const { snapshot, loading, refresh, error: fetchError } = useRoomSnapshot(roomCode, token ?? undefined);

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

  const mySeat = useMemo(() => {
    if (!snapshot?.yourPlayerId) {
      return null;
    }

    return snapshot.players.find((player) => player.playerId === snapshot.yourPlayerId) ?? null;
  }, [snapshot]);

  const availableSeats = useMemo(() => {
    if (!snapshot) {
      return [] as number[];
    }

    const occupied = new Set(snapshot.players.map((player) => player.seatNo));
    return Array.from({ length: 9 }, (_, seatNo) => seatNo).filter((seatNo) => !occupied.has(seatNo));
  }, [snapshot]);

  const allowed = snapshot?.yourPrivateState?.allowedActions ?? null;

  const amountRange = useMemo(() => {
    if (!allowed) {
      return null;
    }

    const max = Math.max(1, Math.floor(allowed.maxPut));
    if (allowed.raise) {
      const min = allowed.toCall + Math.max(1, snapshot?.minRaise ?? 0);
      if (max < min) {
        return null;
      }
      const suggested = Math.min(Math.max(min, 1), max);
      return { min, max, suggested };
    }

    if (allowed.bet) {
      const min = Math.max(allowed.minBet, 1);
      if (max < min) {
        return null;
      }
      const suggested = Math.min(min, max);
      return { min, max, suggested };
    }

    return null;
  }, [allowed, snapshot?.minRaise]);

  const actionWindowKey = useMemo(() => {
    if (!snapshot || !allowed || !snapshot.yourPlayerId) {
      return null;
    }

    return [
      snapshot.handNo,
      snapshot.street ?? "none",
      snapshot.yourPlayerId,
      allowed.toCall,
      allowed.minBet,
      snapshot.minRaise,
      allowed.maxPut,
    ].join(":");
  }, [snapshot, allowed]);

  useEffect(() => {
    if (!amountRange || !actionWindowKey) {
      initializedActionKeyRef.current = null;
      return;
    }

    if (initializedActionKeyRef.current !== actionWindowKey) {
      setAmountInput(String(amountRange.suggested));
      initializedActionKeyRef.current = actionWindowKey;
    }
  }, [amountRange, actionWindowKey]);

  const runAction = async (type: GameActionType) => {
    if (!token || !snapshot) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const requestedAmount = Math.floor(Number(amountInput));
      const isSizedAction = type === "BET" || type === "RAISE";
      if (isSizedAction && !amountRange) {
        throw new Error("No valid 5-multiple amount for this action");
      }

      const steppedRange = amountRange
        ? getStepRange(amountRange.min, amountRange.max, BET_STEP)
        : null;
      if (isSizedAction && !steppedRange) {
        throw new Error("No valid 5-multiple amount for this action");
      }

      const normalizedAmount =
        isSizedAction
          ? normalizeAmountOnBlur(String(requestedAmount), steppedRange)
          : undefined;
      const amountNumber = normalizedAmount == null ? undefined : Math.floor(Number(normalizedAmount));

      await postAction({
        roomCode,
        token,
        command: {
          actionId: makeActionId(),
          type,
          amount: amountNumber,
        },
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("player.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onTakeSeat = async (seatNo: number) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await seatPlayer({ roomCode, token, seatNo });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("player.takeSeatFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className={styles.main}>
        <h1>{t("player.title", { roomCode })}</h1>
        <p>{t("player.tokenMissing")}</p>
      </main>
    );
  }

  if (loading || !snapshot) {
    return (
      <main className={styles.main}>
        <h1>{t("player.title", { roomCode })}</h1>
        <p>{t("player.loading")}</p>
      </main>
    );
  }

  const myCards = snapshot.yourPrivateState?.holeCards ?? [];
  const isYourTurn = Boolean(allowed);
  const viewerName = mySeat?.displayName ?? t("player.notSeated");

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1>{t("player.title", { roomCode: snapshot.roomCode })}</h1>
          <span className={styles.identityBadge}>{t("player.nickname", { name: viewerName })}</span>
        </div>
        <p>
          {t("player.header", {
            handNo: snapshot.handNo,
            street: streetLabel(snapshot.street),
          })}
        </p>
      </header>

      <RoomTable
        communityCards={snapshot.communityCards}
        players={snapshot.players}
        totalPot={snapshot.pot}
        pots={snapshot.pots}
        hasSidePot={snapshot.hasSidePot}
        version={snapshot.version}
        highlightPlayerId={snapshot.players.find((player) => player.isTurn)?.playerId ?? null}
        yourPlayerId={snapshot.yourPlayerId}
        showEligibleNames={false}
      />

      {snapshot.lastShowdown ? (
        <section className={styles.panel}>
          <ShowdownPanel detail={snapshot.lastShowdown} />
        </section>
      ) : null}

      {!mySeat ? (
        <section className={styles.panel}>
          <h2>{t("player.takeSeat")}</h2>
          <p className={styles.meta}>{t("player.rechargeHint")}</p>
          <div className={styles.seatButtons}>
            {availableSeats.map((seatNo) => (
              <button key={seatNo} type="button" disabled={busy} onClick={() => onTakeSeat(seatNo)}>
                {t("player.seat", { seat: seatNo + 1 })}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.panel}>
            <h2>{t("player.yourHand")}</h2>
            <p className={styles.meta}>
              {t("player.stackLine", {
                stack: mySeat.stack,
                state: isYourTurn ? t("player.yourTurn") : t("player.waiting"),
              })}
            </p>
            <div className={styles.handCards}>
              {myCards.length > 0 ? (
                myCards.map((card, index) => (
                  <PlayingCard
                    key={`${card.rank}_${card.suit}_${index}`}
                    rank={card.rank}
                    suit={card.suit}
                    faceUp
                    size={96}
                  />
                ))
              ) : (
                <>
                  <PlayingCard rank="A" suit="spades" faceUp={false} size={96} />
                  <PlayingCard rank="K" suit="hearts" faceUp={false} size={96} />
                </>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <h2>{t("player.actions")}</h2>
            <div className={styles.actionRow}>
              <button type="button" disabled={!allowed?.fold || busy} onClick={() => runAction("FOLD")}>
                {t("player.fold")}
              </button>
              <button type="button" disabled={!allowed?.check || busy} onClick={() => runAction("CHECK")}>
                {t("player.check")}
              </button>
              <button type="button" disabled={!allowed?.call || busy} onClick={() => runAction("CALL")}>
                {t("player.call", { toCall: allowed?.toCall ?? 0 })}
              </button>
            </div>
            <div className={styles.actionRow}>
              <input
                type="number"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                onBlur={() => setAmountInput((current) => normalizeAmountOnBlur(current, amountRange))}
                disabled={busy || !(allowed?.bet || allowed?.raise) || !amountRange}
              />
              <button
                type="button"
                disabled={!allowed?.bet || busy || !amountRange}
                onClick={() => runAction("BET")}
              >
                {t("player.bet")}
              </button>
              <button
                type="button"
                disabled={!allowed?.raise || busy || !amountRange}
                onClick={() => runAction("RAISE")}
              >
                {t("player.raise")}
              </button>
              <button type="button" disabled={!allowed?.allIn || busy} onClick={() => runAction("ALL_IN")}>
                {t("player.allIn")}
              </button>
            </div>
          </section>
        </>
      )}

      {error || fetchError ? <p className={styles.error}>{error ?? fetchError}</p> : null}
    </main>
  );
}
