import type { Card, PlayerPublicState } from "@/lib/protocol/types";
import { PlayingCard } from "@/components/game/playing-card";
import styles from "./room-table.module.css";

interface RoomTableProps {
  communityCards: Card[];
  players: PlayerPublicState[];
  highlightPlayerId?: string | null;
  yourPlayerId?: string | null;
}

function seatLabel(player: PlayerPublicState): string {
  const tags = [
    player.isDealer ? "D" : null,
    player.isSmallBlind ? "SB" : null,
    player.isBigBlind ? "BB" : null,
  ].filter(Boolean);

  return tags.length > 0 ? `(${tags.join("/")})` : "";
}

export function RoomTable({
  communityCards,
  players,
  highlightPlayerId = null,
  yourPlayerId = null,
}: RoomTableProps) {
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

      <div className={styles.seatGrid}>
        {players.map((player) => {
          const active = highlightPlayerId === player.playerId;
          const me = yourPlayerId === player.playerId;
          return (
            <article
              key={player.playerId}
              className={`${styles.seatCard} ${active ? styles.active : ""} ${me ? styles.me : ""}`}
            >
              <header className={styles.seatHeader}>
                <span className={styles.name}>{player.displayName}</span>
                <span className={styles.meta}>S{player.seatNo + 1}</span>
              </header>
              <p className={styles.tags}>{seatLabel(player)}</p>
              <p className={styles.stack}>{player.stack} chips</p>
              <p className={styles.state}>
                {player.folded
                  ? "Folded"
                  : player.allIn
                    ? "All-in"
                    : player.isTurn
                      ? "Acting"
                      : player.inHand
                        ? "In hand"
                        : "Waiting"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
