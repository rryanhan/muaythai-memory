import type { StatusTagDto } from "@/data/types";

export function updateStatusTags(current: StatusTagDto[], status: StatusTagDto, selected: boolean): StatusTagDto[] {
  const withoutStatus = current.filter((item) => item.slug !== status.slug);
  return selected ? [...withoutStatus, status].sort((a, b) => a.sortOrder - b.sortOrder) : withoutStatus;
}
