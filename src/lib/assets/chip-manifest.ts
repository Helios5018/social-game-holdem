export const CHIP_VALUES = [1000, 500, 100, 25, 5, 1] as const;

export type ChipValue = (typeof CHIP_VALUES)[number];

export interface ChipAsset {
  value: ChipValue;
  path: string;
  tone: "gold" | "teal" | "blue" | "violet" | "rose" | "slate";
}

export const chipAssetManifest: ChipAsset[] = [
  { value: 1000, path: "/chips/chip_1000.svg", tone: "gold" },
  { value: 500, path: "/chips/chip_500.svg", tone: "teal" },
  { value: 100, path: "/chips/chip_100.svg", tone: "blue" },
  { value: 25, path: "/chips/chip_25.svg", tone: "violet" },
  { value: 5, path: "/chips/chip_5.svg", tone: "rose" },
  { value: 1, path: "/chips/chip_1.svg", tone: "slate" },
];

const chipAssetByValue = new Map<ChipValue, ChipAsset>(
  chipAssetManifest.map((asset) => [asset.value, asset] as const),
);

export function getChipAsset(value: ChipValue): ChipAsset {
  return chipAssetByValue.get(value) ?? chipAssetManifest[chipAssetManifest.length - 1];
}

export interface ChipStackBreakdown {
  chips: ChipValue[];
  overflow: number;
}

export function buildChipStack(amount: number, maxChips = 12): ChipStackBreakdown {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount === 0) {
    return { chips: [], overflow: 0 };
  }

  const chips: ChipValue[] = [];
  let remaining = safeAmount;

  for (const value of CHIP_VALUES) {
    if (remaining <= 0) {
      break;
    }

    const count = Math.floor(remaining / value);
    for (let index = 0; index < count; index += 1) {
      chips.push(value);
    }
    remaining %= value;
  }

  if (chips.length <= maxChips) {
    return { chips, overflow: 0 };
  }

  return {
    chips: chips.slice(0, maxChips),
    overflow: chips.length - maxChips,
  };
}
