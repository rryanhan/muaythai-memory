"use client";

import { Drawer } from "vaul";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import type { FighterSummary } from "@/data/connections";
import styles from "./Friends.module.css";

export function FriendConfirmationSheet({
  action,
  fighter,
  open,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  action: "unfollow" | "block";
  fighter: FighterSummary;
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const contentRef = useDrawerFocus(open);
  const unfollowing = action === "unfollow";

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !pending && onClose()}
      direction="bottom"
      modal
      dismissible={!pending}
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.drawerBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.confirmationSheet}
          aria-label={unfollowing ? "Unfollow confirmation" : "Block fighter confirmation"}
        >
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild>
            <h2>{unfollowing ? "Unfollow?" : "Block Fighter?"}</h2>
          </Drawer.Title>
          <Drawer.Description asChild>
            <p>
              {unfollowing
                ? `You will stop following @${fighter.username}. Any shared drills between you will be removed if you no longer follow each other.`
                : `@${fighter.username} will not be able to find your profile or send another request.`}
            </p>
          </Drawer.Description>
          {error && <p className={styles.drawerError} role="alert">{error}</p>}
          <div className={styles.drawerActions}>
            <button
              type="button"
              data-drawer-initial-focus
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="button" disabled={pending} onClick={onConfirm}>
              {pending
                ? "Working…"
                : unfollowing ? "Unfollow" : "Block Fighter"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
