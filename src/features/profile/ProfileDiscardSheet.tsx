"use client";

import { Drawer } from "vaul";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import styles from "./ProfileEdit.module.css";

export function ProfileDiscardSheet({
  open,
  onStay,
  onDiscard,
}: {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
}) {
  const contentRef = useDrawerFocus(open);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onStay()}
      direction="bottom"
      modal
      dismissible
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.discardBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.discardSheet}
          aria-label="Discard profile changes confirmation"
        >
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild><h2>Discard profile changes?</h2></Drawer.Title>
          <Drawer.Description asChild><p>Your unsaved name and photo changes will be lost.</p></Drawer.Description>
          <div className={styles.discardActions}>
            <button type="button" data-drawer-initial-focus onClick={onStay}>Keep editing</button>
            <button type="button" onClick={onDiscard}>Discard changes</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
