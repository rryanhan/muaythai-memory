"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { deleteJournalEntry } from "@/data/journal";
import styles from "./Journal.module.css";

export function JournalDeleteSection({ entryId }: { entryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Mutation callbacks can outlive this observer after route navigation.
  const mountedRef = useRef(false);
  const deletePendingRef = useRef(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteJournalEntry(entryId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["journal", entryId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drill-journal"] }),
      ]);
      if (!mountedRef.current) return;
      router.replace("/?view=profile");
      router.refresh();
    },
    onSettled: () => {
      deletePendingRef.current = false;
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function closeConfirmation() {
    if (!deletePendingRef.current) setOpen(false);
  }

  function confirmDelete() {
    if (deletePendingRef.current) return;
    deletePendingRef.current = true;
    deleteMutation.mutate();
  }

  return (
    <section className={styles.deleteSection}>
      <button
        className={styles.deleteButton}
        type="button"
        disabled={deleteMutation.isPending}
        onClick={() => {
          if (deletePendingRef.current) return;
          deleteMutation.reset();
          setOpen(true);
        }}
      >
        Delete Entry
      </button>
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
          else closeConfirmation();
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.sheetOverlay} />
          <Drawer.Content className={styles.deleteSheet} aria-label="Delete journal entry confirmation">
            <Drawer.Handle className="sheet-handle" />
            <Drawer.Title asChild><h2>Delete this entry?</h2></Drawer.Title>
            <Drawer.Description asChild><p>The video and journal entry cannot be recovered.</p></Drawer.Description>
            {deleteMutation.isError && (
              <p className={styles.deleteError} role="alert">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Entry could not be deleted."}
              </p>
            )}
            <div className={styles.sheetActions}>
              <button type="button" disabled={deleteMutation.isPending} onClick={closeConfirmation}>Cancel</button>
              <button
                type="button"
                data-danger="true"
                disabled={deleteMutation.isPending}
                onClick={confirmDelete}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Entry"}
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  );
}
