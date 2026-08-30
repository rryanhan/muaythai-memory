"use client";

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { Copy } from "@phosphor-icons/react/Copy";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import styles from "./Connections.module.css";

export function ProfileInviteSheet({
  username,
  open,
  onClose,
}: {
  username: string;
  open: boolean;
  onClose: () => void;
}) {
  const contentRef = useDrawerFocus(open);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const profileUrl = typeof window === "undefined"
    ? ""
    : `${window.location.origin}/fighters/${encodeURIComponent(username)}`;

  useEffect(() => {
    if (!open || !profileUrl) return;
    let active = true;
    void import("qrcode")
      .then(({ toDataURL }) => toDataURL(profileUrl, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
          dark: "#242729",
          light: "#f5f4ef",
        },
      }))
      .then((dataUrl) => active && setQrUrl(dataUrl))
      .catch(() => active && setStatus("QR code could not be generated."));
    return () => {
      active = false;
    };
  }, [open, profileUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setStatus("Profile link copied.");
    } catch {
      setStatus("Profile link could not be copied.");
    }
  }

  async function shareProfile() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `@${username} on Muay Thai Memory`,
        text: `Find me on Muay Thai Memory: @${username}`,
        url: profileUrl,
      });
      setStatus("Profile shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Profile could not be shared.");
    }
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        setStatus(null);
        onClose();
      }}
      direction="bottom"
      modal
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.drawerBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.inviteSheet}
          aria-label="Share your fighter profile"
        >
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild><h2>Share Your Profile</h2></Drawer.Title>
          <Drawer.Description asChild>
            <p>Let a training partner scan this code or send them your link.</p>
          </Drawer.Description>
          <div className={styles.qrStage}>
            {qrUrl ? (
              // A generated data URL should not go through Next's image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt={`QR code for @${username}`} />
            ) : (
              <span role="status">Building code…</span>
            )}
          </div>
          <strong className={styles.inviteUsername}>@{username}</strong>
          {status && <p className={styles.inviteStatus} role="status">{status}</p>}
          <div className={styles.inviteActions}>
            <button
              type="button"
              data-drawer-initial-focus
              onClick={() => void copyLink()}
            >
              <Copy size={19} weight="bold" aria-hidden="true" />
              Copy Link
            </button>
            <button type="button" onClick={() => void shareProfile()}>
              <ShareNetwork size={19} weight="bold" aria-hidden="true" />
              Share
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
