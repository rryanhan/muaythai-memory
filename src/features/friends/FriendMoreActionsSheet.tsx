"use client";

import { Drawer } from "vaul";
import { Flag } from "@phosphor-icons/react/Flag";
import { Prohibit } from "@phosphor-icons/react/Prohibit";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import type { FighterSummary } from "@/data/connections";
import styles from "./Friends.module.css";

export function FriendMoreActionsSheet({
  fighter,
  open,
  allowBlock,
  onClose,
  onShare,
  onReport,
  onBlock,
}: {
  fighter: FighterSummary;
  open: boolean;
  allowBlock: boolean;
  onClose: () => void;
  onShare: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const contentRef = useDrawerFocus(open);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      direction="bottom"
      modal
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.drawerBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.moreSheet}
          aria-label={`More actions for @${fighter.username}`}
        >
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild>
            <h2>@{fighter.username}</h2>
          </Drawer.Title>
          <Drawer.Description className="sr-only">
            Share or manage this fighter profile.
          </Drawer.Description>
          <div className={styles.moreActions}>
            <button
              type="button"
              data-drawer-initial-focus
              onClick={onShare}
            >
              <ShareNetwork size={20} weight="bold" aria-hidden="true" />
              Share Profile
            </button>
            <button type="button" onClick={onReport}>
              <Flag size={20} weight="bold" aria-hidden="true" />
              Report Fighter
            </button>
            {allowBlock && (
              <button type="button" data-danger onClick={onBlock}>
                <Prohibit size={20} weight="bold" aria-hidden="true" />
                Block Fighter
              </button>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
