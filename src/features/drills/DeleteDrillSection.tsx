"use client";

import { Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer } from "vaul";
import { ApiError, deleteDrill } from "@/data";
import styles from "./DrillForm.module.css";

type DeleteDrillSectionProps = {
  drillId: string;
  drillTitle: string;
};

/** Keeps irreversible deletion isolated from the routine edit form actions. */
export function DeleteDrillSection({ drillId, drillTitle }: DeleteDrillSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteDrill(drillId),
    onSuccess: async (deletedId) => {
      queryClient.removeQueries({ queryKey: ["drill", deletedId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
        queryClient.invalidateQueries({ queryKey: ["graph"] }),
      ]);
      router.replace("/?view=library");
      router.refresh();
    },
  });

  function closeConfirmation() {
    if (!deleteMutation.isPending) setConfirmationOpen(false);
  }

  return (
    <section className={styles.dangerSection} aria-labelledby="delete-drill-heading">
      <div>
        <h2 id="delete-drill-heading">Delete Drill</h2>
      </div>
      <button
        type="button"
        className={styles.deleteTrigger}
        onClick={() => {
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
        dismissible={!deleteMutation.isPending}
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
              <button type="button" onClick={closeConfirmation} disabled={deleteMutation.isPending}>
                Keep Drill
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
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
