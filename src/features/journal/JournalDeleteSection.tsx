"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { deleteJournalEntry } from "@/data/journal";
import styles from "./Journal.module.css";

export function JournalDeleteSection({ entryId }: { entryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteJournalEntry(entryId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["journal", entryId] });
      await queryClient.invalidateQueries({ queryKey: ["journal"] });
      router.replace("/?view=profile");
      router.refresh();
    },
  });

  return (
    <section className={styles.deleteSection}>
      <button className={styles.deleteButton} type="button" onClick={() => setOpen(true)}>
        Delete Entry
      </button>
      {deleteMutation.isError && (
        <p className={styles.deleteError} role="alert">
          {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Entry could not be deleted."}
        </p>
      )}

      <Drawer.Root open={open} onOpenChange={(nextOpen) => !deleteMutation.isPending && setOpen(nextOpen)}>
        <Drawer.Portal>
          <Drawer.Overlay className={styles.sheetOverlay} />
          <Drawer.Content className={styles.deleteSheet} aria-label="Delete journal entry confirmation">
            <Drawer.Handle className="sheet-handle" />
            <Drawer.Title asChild><h2>Delete this entry?</h2></Drawer.Title>
            <Drawer.Description asChild><p>The video and journal entry cannot be recovered.</p></Drawer.Description>
            <div className={styles.sheetActions}>
              <button type="button" disabled={deleteMutation.isPending} onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="button"
                data-danger="true"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
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
