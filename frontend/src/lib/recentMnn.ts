export const RECENT_LIMIT = 8;
const recentKey = (marketId: number) => `pharmdash.recentMnn.${marketId}`;

export function readRecentMnn(marketId: number): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(marketId)) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function pushRecentMnn(marketId: number, mnn: string) {
  const next = [mnn, ...readRecentMnn(marketId).filter((m) => m !== mnn)]
    .slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(recentKey(marketId), JSON.stringify(next));
  } catch {
    return;
  }
}
