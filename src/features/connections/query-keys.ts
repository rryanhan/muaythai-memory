export const drillShareQueryKeyPrefix = ["drill-shares"] as const;

export function drillShareQueryKey(drillId: string) {
  return [...drillShareQueryKeyPrefix, drillId] as const;
}
