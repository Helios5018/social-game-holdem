import type { Card, CardRank } from "@/lib/protocol/types";

export type HandRank = {
  category: number;
  kickers: number[];
  label: string;
};

export function rankToValue(rank: CardRank): number {
  switch (rank) {
    case "A":
      return 14;
    case "K":
      return 13;
    case "Q":
      return 12;
    case "J":
      return 11;
    default:
      return Number(rank);
  }
}

export function combinations<T>(items: T[], count: number): T[][] {
  if (count === 0) {
    return [[]];
  }

  if (items.length < count) {
    return [];
  }

  if (items.length === count) {
    return [items.slice()];
  }

  const [head, ...tail] = items;
  const withHead = combinations(tail, count - 1).map((combo) => [head, ...combo]);
  const withoutHead = combinations(tail, count);
  return [...withHead, ...withoutHead];
}

export function compareKickers(left: number[], right: number[]): number {
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const lv = left[index] ?? 0;
    const rv = right[index] ?? 0;
    if (lv !== rv) {
      return lv > rv ? 1 : -1;
    }
  }

  return 0;
}

export function compareHandRank(left: HandRank, right: HandRank): number {
  if (left.category !== right.category) {
    return left.category > right.category ? 1 : -1;
  }

  return compareKickers(left.kickers, right.kickers);
}

export function evaluateFive(cards: Card[]): HandRank {
  const values = cards.map((card) => rankToValue(card.rank)).sort((a, b) => b - a);
  const suits = cards.map((card) => card.suit);
  const isFlush = suits.every((suit) => suit === suits[0]);

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  const wheel = [14, 5, 4, 3, 2];

  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      straightHigh = unique[0];
    } else if (unique.join(",") === wheel.join(",")) {
      straightHigh = 5;
    }
  }

  const grouped = Array.from(counts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }

    return b[0] - a[0];
  });

  if (isFlush && straightHigh > 0) {
    return {
      category: 8,
      kickers: [straightHigh],
      label: straightHigh === 14 ? "Royal Flush" : "Straight Flush",
    };
  }

  if (grouped[0][1] === 4) {
    return {
      category: 7,
      kickers: [grouped[0][0], grouped[1][0]],
      label: "Four of a Kind",
    };
  }

  if (grouped[0][1] === 3 && grouped[1][1] === 2) {
    return {
      category: 6,
      kickers: [grouped[0][0], grouped[1][0]],
      label: "Full House",
    };
  }

  if (isFlush) {
    return {
      category: 5,
      kickers: values,
      label: "Flush",
    };
  }

  if (straightHigh > 0) {
    return {
      category: 4,
      kickers: [straightHigh],
      label: "Straight",
    };
  }

  if (grouped[0][1] === 3) {
    return {
      category: 3,
      kickers: [grouped[0][0], grouped[1][0], grouped[2][0]],
      label: "Three of a Kind",
    };
  }

  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    const pairTop = Math.max(grouped[0][0], grouped[1][0]);
    const pairLow = Math.min(grouped[0][0], grouped[1][0]);
    return {
      category: 2,
      kickers: [pairTop, pairLow, grouped[2][0]],
      label: "Two Pair",
    };
  }

  if (grouped[0][1] === 2) {
    const kickers = grouped.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 1,
      kickers: [grouped[0][0], ...kickers],
      label: "One Pair",
    };
  }

  return {
    category: 0,
    kickers: values,
    label: "High Card",
  };
}

export function evaluateSeven(cards: Card[]): HandRank {
  const fiveCardCombos = combinations(cards, 5);
  let best = evaluateFive(fiveCardCombos[0]);
  for (const combo of fiveCardCombos.slice(1)) {
    const candidate = evaluateFive(combo);
    if (compareHandRank(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best;
}
