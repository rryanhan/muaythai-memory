"use client";

import { Drawer } from "vaul";
import styles from "./Journal.module.css";

export function JournalDiscardSheet({
  open,
  pending,
  onStay,
  onDiscard,
}: {
  open: boolean;
  pending: boolean;
  onStay: () => void;
  onDiscard: () => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => !nextOpen && !pending && onStay()}>
      <Drawer.Portal>
        <Drawer.Overlay className={styles.sheetOverlay} />
        <Drawer.Content className={styles.discardSheet} aria-label="Discard journal entry confirmation">
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild><h2>Discard journal entry?</h2></Drawer.Title>
          <Drawer.Description asChild>
            <p>Your selected video and unsaved entry details will be lost.</p>
          </Drawer.Description>
          <div className={styles.sheetActions}>
            <button type="button" disabled={pending} onClick={onStay}>Keep editing</button>
            <button type="button" disabled={pending} data-danger="true" onClick={onDiscard}>
              {pending ? "Discarding..." : "Discard entry"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
