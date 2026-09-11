// Shared data contracts only. Runtime callers import their focused domain
// entrypoint directly so unrelated API clients cannot enter the same graph.
export type * from "./types";
