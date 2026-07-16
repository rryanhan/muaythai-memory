import type { DrillCleanupValues } from "./cleanup-merge";

export type DrillFormCleanupState = {
  status: "idle" | "pending" | "ready" | "error";
  revision?: number;
  values?: DrillCleanupValues;
  errorMessage?: string;
  onRetry?: () => void;
};

export type DrillFormInitialValues = {
  title?: string;
  summary?: string | null;
  notes?: string | null;
  steps?: string[];
  trainingMethodSlugs?: string[];
  tagSlugs?: string[];
  statusTagSlugs?: string[];
};
