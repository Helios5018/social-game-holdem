"use client";

import { memo } from "react";
import { PlayingCard } from "@/components/game/playing-card";
import { useLanguage } from "@/components/i18n/language-provider";
import type { ShowdownDetail } from "@/lib/protocol/types";
import styles from "./showdown-panel.module.css";

interface ShowdownPanelProps {
  detail: ShowdownDetail;
}

function ShowdownPanelImpl({ detail }: ShowdownPanelProps) {
  const { t } = useLanguage();

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <h2>{t("showdown.title", { handNo: detail.handNo })}</h2>
      </header>

      <div className={styles.boardBlock}>
        <p className={styles.label}>{t("showdown.board")}</p>
        <div className={styles.cardsRow}>
          {detail.communityCards.map((card, index) => (
            <PlayingCard
              key={`${card.rank}_${card.suit}_${index}`}
              rank={card.rank}
              suit={card.suit}
              faceUp
              size={56}
            />
          ))}
        </div>
      </div>

      <div className={styles.playerGrid}>
        {detail.players.map((player) => (
          <article
            key={player.playerId}
            className={`${styles.playerCard} ${player.isWinner ? styles.winner : ""}`}
          >
            <div className={styles.playerHeader}>
              <span className={styles.playerName}>{player.displayName}</span>
              {player.isWinner ? <span className={styles.winnerTag}>{t("showdown.winner")}</span> : null}
            </div>
            <p className={styles.handLabel}>
              {t("showdown.hand")}: {player.handLabel}
            </p>
            <div className={styles.cardsRow}>
              {player.holeCards.map((card, index) => (
                <PlayingCard
                  key={`${player.playerId}_${card.rank}_${card.suit}_${index}`}
                  rank={card.rank}
                  suit={card.suit}
                  faceUp
                  size={52}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export const ShowdownPanel = memo(ShowdownPanelImpl);
