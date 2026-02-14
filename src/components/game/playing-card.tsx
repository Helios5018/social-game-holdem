"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCardAsset,
  type CardRank,
  type CardSuit,
} from "@/lib/assets/card-manifest";
import styles from "./playing-card.module.css";

const CARD_RATIO = 10 / 7;
const DEFAULT_WIDTH = 88;

export interface PlayingCardProps {
  rank: CardRank;
  suit: CardSuit;
  faceUp?: boolean;
  size?: number;
  className?: string;
}

export function PlayingCard({
  rank,
  suit,
  faceUp = false,
  size = DEFAULT_WIDTH,
  className,
}: PlayingCardProps) {
  const [frontLoadError, setFrontLoadError] = useState(false);

  const asset = useMemo(() => getCardAsset(rank, suit), [rank, suit]);
  const width = Number.isFinite(size) ? Math.max(44, size) : DEFAULT_WIDTH;
  const height = Math.round(width * CARD_RATIO);
  const frontSource = frontLoadError ? asset.backPath : asset.frontPath;

  useEffect(() => {
    setFrontLoadError(false);
  }, [rank, suit]);

  return (
    <div
      className={[
        styles.card,
        faceUp ? styles.faceUp : "",
        className ? className : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: `${width}px`, height: `${height}px` }}
      data-accent={asset.accentTheme}
      aria-label={faceUp ? `${rank} of ${suit}` : "Face down card"}
    >
      <div className={styles.cardInner}>
        <img
          className={`${styles.face} ${styles.front}`}
          src={frontSource}
          alt={`${rank} of ${suit}`}
          loading="lazy"
          onError={() => setFrontLoadError(true)}
        />
        <img
          className={`${styles.face} ${styles.back}`}
          src={asset.backPath}
          alt="Card back"
          loading="lazy"
        />
      </div>
    </div>
  );
}
