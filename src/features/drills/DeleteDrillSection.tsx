"use client";

import { Trash } from "@phosphor-icons/react/Trash";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { ApiError } from "@/data/api-core";
import { deleteDrill } from "@/data/drills";
import styles from "./DrillForm.module.css";

type DeleteDrillSectionProps = {
  drillId: string;
  drillTitle: string;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onDeleted?: (deletedId: string) => void;
};

/** Keeps irreversible deletion isolated from the routine edit form actions. */
export function DeleteDrillSection({
  drillId,
  drillTitle,
  disabled = false,
  onPendingChange,
  onDeleted,
}: DeleteDrillSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  // TanStack mutation option callbacks continue after their observer unmounts.
  const mountedRef = useRef(false);
  const deletePendingRef = useRef(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteDrill(drillId),
    onSuccess: async (deletedId) => {
      queryClient.removeQueries({ queryKey: ["drill", deletedId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
        queryClient.invalidateQueries({ queryKey: ["graph"] }),
        queryClient.invalidateQueries({ queryKey: ["profile", "overview"] }),
      ]);
      if (!mountedRef.current) return;
      if (onDeleted) {
        onDeleted(deletedId);
        return;
      }
      router.replace("/?view=library");
      router.refresh();
    },
    onSettled: () => {
      deletePendingRef.current = false;
      if (mountedRef.current) onPendingChange?.(false);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function closeConfirmation() {
    if (!deletePendingRef.current && !disabled) setConfirmationOpen(false);
  }

  function confirmDelete() {
    if (disabled || deletePendingRef.current) return;
    deletePendingRef.current = true;
    onPendingChange?.(true);
    deleteMutation.mutate();
  }

  return (
    <section
      className={styles.dangerSection}
      aria-labelledby="delete-drill-heading"
      aria-busy={deleteMutation.isPending}
    >
      <div>
        <h2 id="delete-drill-heading">Delete Drill</h2>
      </div>
      <button
        type="button"
        className={styles.deleteTrigger}
        disabled={disabled || deleteMutation.isPending}
        onClick={() => {
          if (disabled || deleteMutation.isPending) return;
          deleteMutation.reset();
          setConfirmationOpen(true);
        }}
      >
        <Trash size={18} weight="regular" />
        Delete Drill
      </button>

      <Drawer.Root
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true);
          else closeConfirmation();
        }}
        direction="bottom"
        modal
        dismissible={!deleteMutation.isPending && !disabled}
        autoFocus={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.deleteBackdrop} />
          <Drawer.Content className={styles.deleteSheet} aria-label="Delete drill confirmation">
            <Drawer.Handle className="sheet-handle" />
            <Drawer.Title asChild>
              <h2>Delete {drillTitle}?</h2>
            </Drawer.Title>
            <Drawer.Description asChild>
              <p>
                This permanently removes the drill, its steps, tags, and saved-list markers. This
                cannot be undone.
              </p>
            </Drawer.Description>

            {deleteMutation.isError && (
              <p className={styles.deleteError} role="alert">
                {getDeleteErrorMessage(deleteMutation.error)}
              </p>
            )}

            <div className={styles.deleteActions}>
              <button
                type="button"
                onClick={closeConfirmation}
                disabled={disabled || deleteMutation.isPending}
              >
                Keep Drill
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={disabled || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Drill"}
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  );
}

function getDeleteErrorMessage(error: unknown): string {
  const responseBody = (error as ApiError | undefined)?.responseBody;
  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    return String(responseBody.error);
  }
  return "The drill could not be deleted. Try again.";
}
