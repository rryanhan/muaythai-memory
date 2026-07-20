"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "@phosphor-icons/react/Star";
import { Target } from "@phosphor-icons/react/Target";
import { useQueryClient } from "@tanstack/react-query";
import { updateDrillSavedList } from "@/data/drills";
import type {
  DrillListResponse,
  SavedListSlug,
  StatusTagDto,
  UpdateSavedListResponse,
} from "@/data/types";
import { getSavedListDefinition, savedListDefinitions } from "./saved-list-config";
import { updateStatusTags } from "./saved-list-state";
import styles from "./SavedListActions.module.css";

type SavedListActionsProps = {
  drillId: string;
  statusTags: StatusTagDto[];
  onSuccess?: (result: UpdateSavedListResponse) => void;
};

export function SavedListActions({
  drillId,
  statusTags,
  onSuccess,
}: SavedListActionsProps) {
  const queryClient = useQueryClient();
  const statusSignature = statusTags.map((status) => status.slug).sort().join("|");
  const initialSelected = useMemo(
    () => new Set(statusSignature.split("|").filter(isSavedListSlug)),
    [statusSignature],
  );
  const [selectedSlugs, setSelectedSlugs] = useState(initialSelected);
  const [pendingSlugs, setPendingSlugs] = useState<Set<SavedListSlug>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSlugs(initialSelected);
  }, [initialSelected]);

  useEffect(() => {
    if (!errorMessage) return;
    const timeout = window.setTimeout(() => setErrorMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  async function toggle(slug: SavedListSlug) {
    if (pendingSlugs.has(slug)) return;

    const previousSelected = selectedSlugs.has(slug);
    const selected = !previousSelected;
    const optimisticStatus = getOptimisticStatus(slug, statusTags);

    setErrorMessage(null);
    setSelectedSlugs((current) => withSavedListSelection(current, slug, selected));
    setPendingSlugs((current) => new Set(current).add(slug));
    updateCachedDrillStatuses(queryClient, drillId, optimisticStatus, selected);

    try {
      const result = await updateDrillSavedList(drillId, { slug, selected });
      updateCachedDrillStatuses(queryClient, drillId, result.status, result.selected);
      onSuccess?.(result);
    } catch {
      setSelectedSlugs((current) => withSavedListSelection(current, slug, previousSelected));
      updateCachedDrillStatuses(queryClient, drillId, optimisticStatus, previousSelected);
      setErrorMessage(`Couldn’t update ${getSavedListDefinition(slug)?.label ?? "Saved List"}. Try again.`);
    } finally {
      setPendingSlugs((current) => {
        const next = new Set(current);
        next.delete(slug);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["drills"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    }
  }

  return (
    <div className={styles.root} aria-label="Saved Lists">
      {savedListDefinitions.map((definition) => {
        const selected = selectedSlugs.has(definition.slug);
        const pending = pendingSlugs.has(definition.slug);
        const Icon = definition.icon === "target" ? Target : Star;
        const action = selected ? "Remove from" : "Add to";

        return (
          <button
            key={definition.slug}
            type="button"
            className={styles.button}
            aria-label={`${action} ${definition.label}`}
            title={`${action} ${definition.label}`}
            aria-pressed={selected}
            data-selected={selected}
            data-pending={pending}
            disabled={pending}
            onClick={() => void toggle(definition.slug)}
          >
            <Icon size={20} weight={selected ? "fill" : "regular"} aria-hidden="true" />
          </button>
        );
      })}
      {errorMessage && (
        <p className={styles.error} role="status" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function isSavedListSlug(slug: string): slug is SavedListSlug {
  return slug === "starred" || slug === "drill-back-in";
}

function withSavedListSelection(current: Set<SavedListSlug>, slug: SavedListSlug, selected: boolean) {
  const next = new Set(current);
  if (selected) next.add(slug);
  else next.delete(slug);
  return next;
}

function getOptimisticStatus(slug: SavedListSlug, statusTags: StatusTagDto[]): StatusTagDto {
  const existing = statusTags.find((status) => status.slug === slug);
  if (existing) return existing;

  const definition = getSavedListDefinition(slug);
  return {
    id: slug,
    name: definition?.label ?? slug,
    slug,
    sortOrder: definition?.sortOrder ?? 0,
  };
}

function updateCachedDrillStatuses(
  queryClient: ReturnType<typeof useQueryClient>,
  drillId: string,
  status: StatusTagDto,
  selected: boolean,
) {
  queryClient.setQueriesData<DrillListResponse>({ queryKey: ["drills"] }, (current) => {
    if (!current?.drills.some((drill) => drill.id === drillId)) return current;

    return {
      ...current,
      drills: current.drills.map((drill) =>
        drill.id === drillId
          ? { ...drill, statusTags: updateStatusTags(drill.statusTags, status, selected) }
          : drill,
      ),
    };
  });
}
