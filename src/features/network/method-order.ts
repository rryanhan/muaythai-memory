export const NETWORK_METHOD_ORDER = [
  "pad-work",
  "bag-work",
  "partner-drill",
  "clinch",
  "technical-work",
] as const;

export function getNetworkMethodRank(slug: string | undefined): number {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const rank = NETWORK_METHOD_ORDER.indexOf(slug as (typeof NETWORK_METHOD_ORDER)[number]);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}
