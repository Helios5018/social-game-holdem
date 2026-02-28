import type { PotBreakdownItem } from "@/lib/protocol/types";

export function buildPotBreakdown(
  contributionsTotal: Record<string, number>,
  activePlayerIds: string[],
  folded: Set<string>,
): PotBreakdownItem[] {
  const levels = Array.from(new Set(Object.values(contributionsTotal).filter((value) => value > 0))).sort(
    (a, b) => a - b,
  );

  const pots: PotBreakdownItem[] = [];
  let previousLevel = 0;

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const contributors = activePlayerIds.filter((playerId) => contributionsTotal[playerId] >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligiblePlayerIds = contributors.filter((playerId) => !folded.has(playerId));

    if (amount > 0 && eligiblePlayerIds.length > 0) {
      pots.push({
        potId: index === 0 ? "main-0" : `side-${index}`,
        kind: index === 0 ? "main" : "side",
        amount,
        eligiblePlayerIds,
        level,
      });
    }

    previousLevel = level;
  }

  return pots;
}
