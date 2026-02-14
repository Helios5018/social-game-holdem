"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerPublicState, PotBreakdownItem } from "@/lib/protocol/types";
import { buildChipStack, getChipAsset, type ChipValue } from "@/lib/assets/chip-manifest";
import { useLanguage } from "@/components/i18n/language-provider";
import styles from "./pot-display.module.css";

interface PotDisplayProps {
  totalPot: number;
  pots: PotBreakdownItem[];
  hasSidePot: boolean;
  version: number;
  players: PlayerPublicState[];
  showEligibleNames?: boolean;
}

function PotDisplayImpl({
  totalPot,
  pots,
  hasSidePot,
  version,
  players,
  showEligibleNames = true,
}: PotDisplayProps) {
  const { t } = useLanguage();
  const [totalPulseTick, setTotalPulseTick] = useState(0);
  const [sideRevealTick, setSideRevealTick] = useState(0);
  const [settling, setSettling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerNameById = useMemo(() => {
    return new Map(players.map((player) => [player.playerId, player.displayName] as const));
  }, [players]);

  const mainPot = useMemo(() => pots.find((pot) => pot.kind === "main") ?? null, [pots]);
  const sidePots = useMemo(() => pots.filter((pot) => pot.kind === "side"), [pots]);

  const totalChipStack = useMemo(() => buildChipStack(totalPot), [totalPot]);

  const prevRef = useRef({
    totalPot,
    sideCount: sidePots.length,
  });

  useEffect(() => {
    const previous = prevRef.current;

    if (totalPot > previous.totalPot) {
      setTotalPulseTick((value) => value + 1);
    }

    if (sidePots.length > previous.sideCount) {
      setSideRevealTick((value) => value + 1);
    }

    if (previous.totalPot > 0 && totalPot === 0) {
      setSettling(true);
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => setSettling(false), 220);
    }

    prevRef.current = {
      totalPot,
      sideCount: sidePots.length,
    };
  }, [version, totalPot, sidePots.length]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const contestLabel = (eligiblePlayerIds: string[]) => {
    if (eligiblePlayerIds.length === 0) {
      return t("pot.none");
    }

    if (!showEligibleNames) {
      return t("pot.eligible", { count: eligiblePlayerIds.length });
    }

    const names = eligiblePlayerIds
      .map((playerId) => playerNameById.get(playerId) ?? playerId)
      .join(", ");

    return t("pot.contestedBy", { players: names });
  };

  const chipAlt = (value: ChipValue) => t("pot.chipValue", { value });
  const mainAmount = mainPot?.amount ?? 0;
  const summaryText = hasSidePot
    ? t("pot.summaryWithSide", { main: mainAmount, sideCount: sidePots.length })
    : t("pot.summaryMainOnly", { main: mainAmount });

  return (
    <section className={`${styles.wrapper} ${settling ? styles.settling : ""}`} aria-live="polite">
      <div key={`total-${totalPulseTick}`} className={styles.totalCard}>
        <div className={styles.totalLabel}>{t("pot.total")}</div>
        <div className={styles.totalAmount}>{totalPot}</div>

        <div className={styles.chipStack}>
          {totalChipStack.chips.length === 0 ? (
            <span className={styles.emptyChip}>{t("pot.none")}</span>
          ) : (
            totalChipStack.chips.map((value, index) => {
              const asset = getChipAsset(value);
              return (
                <img
                  key={`${value}-${index}`}
                  src={asset.path}
                  alt={chipAlt(value)}
                  className={styles.chip}
                  style={{
                    transform: `translateY(${-index * 2}px)`,
                    zIndex: index + 1,
                  }}
                />
              );
            })
          )}
          {totalChipStack.overflow > 0 ? (
            <span className={styles.overflowBadge}>+{totalChipStack.overflow}</span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls="pot-breakdown-panel"
      >
        <span className={styles.toggleSummary}>{summaryText}</span>
        <span className={styles.toggleMeta}>
          {expanded ? t("pot.collapse") : t("pot.expand")}
          <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`} aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      {expanded ? (
        <div id="pot-breakdown-panel" className={styles.breakdown}>
          {mainPot ? (
            <article className={styles.potRow}>
              <div className={styles.potMeta}>
                <span className={styles.potTitle}>{t("pot.main")}</span>
                <span className={styles.potEligible}>{contestLabel(mainPot.eligiblePlayerIds)}</span>
              </div>
              <strong className={styles.potAmount}>{mainPot.amount}</strong>
            </article>
          ) : (
            <article className={styles.potRow}>
              <div className={styles.potMeta}>
                <span className={styles.potTitle}>{t("pot.main")}</span>
                <span className={styles.potEligible}>{t("pot.none")}</span>
              </div>
              <strong className={styles.potAmount}>0</strong>
            </article>
          )}

          {hasSidePot
            ? sidePots.map((pot, index) => (
                <article key={`${pot.potId}-${sideRevealTick}`} className={`${styles.potRow} ${styles.sideRow}`}>
                  <div className={styles.potMeta}>
                    <span className={styles.potTitle}>{t("pot.side", { index: index + 1 })}</span>
                    <span className={styles.potEligible}>{contestLabel(pot.eligiblePlayerIds)}</span>
                  </div>
                  <strong className={styles.potAmount}>{pot.amount}</strong>
                </article>
              ))
            : null}
        </div>
      ) : null}
    </section>
  );
}

export const PotDisplay = memo(PotDisplayImpl);
