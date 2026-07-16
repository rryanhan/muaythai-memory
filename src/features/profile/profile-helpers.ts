import type { DrillSummary, TrainingMethodDto } from "@/data";

export type TrainingMethodCount = {
  method: TrainingMethodDto;
  count: number;
};

export function filterDrillsByStatus(drills: DrillSummary[], statusSlug: string): DrillSummary[] {
  return drills.filter((drill) => drill.statusTags.some((status) => status.slug === statusSlug));
}

export function countDrillsByTrainingMethod(drills: DrillSummary[]): TrainingMethodCount[] {
  const counts = new Map<string, TrainingMethodCount>();

  for (const drill of drills) {
    for (const method of drill.trainingMethods) {
      const existing = counts.get(method.slug);
      counts.set(method.slug, { method, count: (existing?.count ?? 0) + 1 });
    }
  }

  return [...counts.values()].sort(
    (left, right) => left.method.sortOrder - right.method.sortOrder || left.method.name.localeCompare(right.method.name),
  );
}
