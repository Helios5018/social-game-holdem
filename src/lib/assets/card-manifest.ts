export const CARD_RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

export const CARD_SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

export type CardRank = (typeof CARD_RANKS)[number];
export type CardSuit = (typeof CARD_SUITS)[number];
export type CardAccentTheme = "red" | "black";

export interface CardAssetManifest {
  rank: CardRank;
  suit: CardSuit;
  frontPath: string;
  backPath: string;
  accentTheme: CardAccentTheme;
}

export const CARD_BACK_PATH = "/cards/back/default.svg";

const ACCENT_THEME_BY_SUIT: Record<CardSuit, CardAccentTheme> = {
  spades: "black",
  hearts: "red",
  diamonds: "red",
  clubs: "black",
};

export const cardAssetManifest: CardAssetManifest[] = CARD_SUITS.flatMap((suit) =>
  CARD_RANKS.map((rank) => ({
    rank,
    suit,
    frontPath: `/cards/front/${rank}_${suit}.svg`,
    backPath: CARD_BACK_PATH,
    accentTheme: ACCENT_THEME_BY_SUIT[suit],
  })),
);

export const cardAssetManifestByKey = new Map<
  `${CardRank}_${CardSuit}`,
  CardAssetManifest
>(
  cardAssetManifest.map((asset) => [
    `${asset.rank}_${asset.suit}`,
    asset,
  ] as const),
);

export function getCardAsset(rank: CardRank, suit: CardSuit): CardAssetManifest {
  const asset = cardAssetManifestByKey.get(`${rank}_${suit}`);
  if (asset) {
    return asset;
  }

  return {
    rank,
    suit,
    frontPath: CARD_BACK_PATH,
    backPath: CARD_BACK_PATH,
    accentTheme: ACCENT_THEME_BY_SUIT[suit],
  };
}
