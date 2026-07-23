export type HistoryGuardEntry = {
  key: string;
  state: Record<string, unknown>;
  url: string;
};

export function pushHistoryGuard(marker: string, key: string): HistoryGuardEntry {
  const state = {
    ...(window.history.state ?? {}),
    [marker]: key,
  };
  const entry = {
    key,
    state,
    url: window.location.href,
  };
  window.history.pushState(entry.state, "", entry.url);
  return entry;
}

export function restoreHistoryGuard(entry: HistoryGuardEntry): void {
  window.history.pushState(entry.state, "", entry.url);
}

export function isHistoryGuardState(
  state: unknown,
  marker: string,
  key: string | null,
): boolean {
  return Boolean(
    key
    && typeof state === "object"
    && state !== null
    && marker in state
    && (state as Record<string, unknown>)[marker] === key,
  );
}
