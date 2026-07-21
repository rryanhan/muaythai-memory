export type DrillCleanupField =
  | "title"
  | "summary"
  | "notes"
  | "steps"
  | "trainingMethodSlugs"
  | "tagSlugs";

export type DrillCleanupValues = {
  title: string;
  summary: string;
  notes: string;
  steps: string[];
  trainingMethodSlugs: string[];
  tagSlugs: string[];
};

export type DrillDirtyFields = Record<DrillCleanupField, boolean>;
export type PendingDrillCleanup = Partial<DrillCleanupValues>;

export function mergeDrillCleanup(
  current: DrillCleanupValues,
  dirty: DrillDirtyFields,
  suggestion: DrillCleanupValues,
): { applied: DrillCleanupValues; pending: PendingDrillCleanup } {
  const applied: DrillCleanupValues = {
    ...current,
    steps: [...current.steps],
    trainingMethodSlugs: [...current.trainingMethodSlugs],
    tagSlugs: [...current.tagSlugs],
  };
  const pending: PendingDrillCleanup = {};

  for (const field of [
    "title",
    "summary",
    "notes",
    "steps",
    "trainingMethodSlugs",
    "tagSlugs",
  ] as const) {
    if (valuesEqual(current[field], suggestion[field])) continue;

    if (dirty[field]) {
      pending[field] = suggestion[field] as never;
    } else {
      applied[field] = suggestion[field] as never;
    }
  }

  return { applied, pending };
}

export function hasPendingDrillCleanup(pending: PendingDrillCleanup): boolean {
  return Object.keys(pending).length > 0;
}

function valuesEqual(left: string | string[], right: string | string[]): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  return left === right;
}
