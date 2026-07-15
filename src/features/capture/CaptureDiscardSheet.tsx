"use client";

import { Drawer } from "vaul";
import styles from "./Capture.module.css";

type CaptureDiscardSheetProps = {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
};

export function CaptureDiscardSheet({ open, onStay, onDiscard }: CaptureDiscardSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onStay();
      }}
      direction="bottom"
      modal
      dismissible
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.discardBackdrop} />
        <Drawer.Content className={styles.discardSheet} aria-label="Discard capture confirmation">
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild>
            <h2>Discard capture?</h2>
          </Drawer.Title>
          <Drawer.Description asChild>
            <p>Your recording, transcript, and unsaved drill changes will be lost.</p>
          </Drawer.Description>
          <div className={styles.discardActions}>
            <button type="button" onClick={onStay}>
              Keep editing
            </button>
            <button type="button" onClick={onDiscard}>
              Discard capture
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
