"use client";

import { Drawer } from "vaul";
import styles from "./Capture.module.css";

type CaptureDiscardSheetProps = {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
  stayLabel?: string;
  discardLabel?: string;
};

export function CaptureDiscardSheet({
  open,
  onStay,
  onDiscard,
  title = "Discard capture?",
  description = "Your recording, transcript, and unsaved drill changes will be lost.",
  stayLabel = "Keep editing",
  discardLabel = "Discard capture",
}: CaptureDiscardSheetProps) {
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
            <h2>{title}</h2>
          </Drawer.Title>
          <Drawer.Description asChild>
            <p>{description}</p>
          </Drawer.Description>
          <div className={styles.discardActions}>
            <button type="button" onClick={onStay}>
              {stayLabel}
            </button>
            <button type="button" onClick={onDiscard}>
              {discardLabel}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
