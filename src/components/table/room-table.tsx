"use client";

import type { Card, PlayerPublicState, PotBreakdownItem } from "@/lib/protocol/types";
import { buildChipStack, getChipAsset } from "@/lib/assets/chip-manifest";
import { PlayingCard } from "@/components/game/playing-card";
import { useLanguage } from "@/components/i18n/language-provider";
import { PotDisplay } from "./pot-display";
import styles from "./room-table.module.css";

interface RoomTableProps {
  communityCards: Card[];
  players: PlayerPublicState[];
  totalPot: number;
  pots: PotBreakdownItem[];
  hasSidePot: boolean;
  version: number;
  showEligibleNames?: boolean;
  highlightPlayerId?: string | null;
  yourPlayerId?: string | null;
}

export function RoomTable({
  communityCards,
  players,
  totalPot,
  pots,
  hasSidePot,
  version,
  showEligibleNames = true,
  highlightPlayerId = null,
  yourPlayerId = null,
}: RoomTableProps) {
  const { t } = useLanguage();

  const seatLabel = (player: PlayerPublicState): string => {
    const tags = [
      player.isSmallBlind ? t("table.smallBlind") : null,
      player.isBigBlind ? t("table.bigBlind") : null,
    ].filter(Boolean);

    return tags.length > 0 ? `(${tags.join("/")})` : "";
  };

  return (
    <section className={styles.table}>
      <div className={styles.boardRow}>
        {Array.from({ length: 5 }).map((_, index) => {
          const card = communityCards[index];
          if (!card) {
            return <PlayingCard key={`empty-${index}`} rank="A" suit="spades" faceUp={false} size={68} />;
          }

          return (
            <PlayingCard
              key={`${card.rank}_${card.suit}_${index}`}
              rank={card.rank}
              suit={card.suit}
              faceUp
              size={68}
            />
          );
        })}
      </div>

      <PotDisplay
        totalPot={totalPot}
        pots={pots}
        hasSidePot={hasSidePot}
        version={version}
        players={players}
        showEligibleNames={showEligibleNames}
      />

      <div className={styles.seatGrid}>
        {players.map((player) => {
          const active = highlightPlayerId === player.playerId;
          const me = yourPlayerId === player.playerId;
          const streetBet = player.streetContribution;
          const handBet = player.contribution;
          const betStack = buildChipStack(streetBet, 6);
          return (
            <article
              key={player.playerId}
              className={`${styles.seatCard} ${active ? styles.active : ""} ${me ? styles.me : ""}`}
            >
              <header className={styles.seatHeader}>
                <span className={styles.nameWrap}>
                  {player.isDealer ? (
                    <span className={styles.dealerDot} title={t("table.dealer")} aria-label={t("table.dealer")} />
                  ) : null}
                  <span className={styles.name}>{player.displayName}</span>
                </span>
                <span className={styles.meta}>S{player.seatNo + 1}</span>
              </header>
              <p className={styles.tags}>{seatLabel(player)}</p>
              <p className={styles.stack}>{t("table.chips", { chips: player.stack })}</p>
              <div className={styles.betRow}>
                <span className={styles.betText}>{t("table.betStreet", { amount: streetBet })}</span>
                <span className={styles.betChips} aria-hidden="true">
                  {betStack.chips.length > 0 ? (
                    betStack.chips.map((value, index) => (
                      <img
                        key={`${player.playerId}-${value}-${index}`}
                        src={getChipAsset(value).path}
                        alt=""
                        className={styles.betChip}
                        style={{
                          transform: `translateY(${-index}px)`,
                          zIndex: index + 1,
                        }}
                        loading="lazy"
                      />
                    ))
                  ) : (
                    <span className={styles.betNone}>{t("pot.none")}</span>
                  )}
                  {betStack.overflow > 0 ? (
                    <span className={styles.betOverflow}>+{betStack.overflow}</span>
                  ) : null}
                </span>
              </div>
              <p className={styles.betSecondary}>{t("table.betHand", { amount: handBet })}</p>
              <p className={styles.state}>
                {player.folded
                  ? t("table.folded")
                  : player.allIn
                    ? t("table.allIn")
                    : player.isTurn
                      ? t("table.acting")
                      : player.inHand
                        ? t("table.inHand")
                        : t("table.waiting")}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
