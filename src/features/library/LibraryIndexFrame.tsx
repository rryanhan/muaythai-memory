"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useModalFallbackAccessibility } from "@/components/shared/useModalFallbackAccessibility";
import styles from "./Library.module.css";

type LibraryIndexFrameProps = {
  children: ReactNode;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function LibraryIndexFrame({
  children,
  onClose,
  returnFocusRef,
}: LibraryIndexFrameProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    fallbackReturnFocusRef: returnFocusRef,
    initialFocusRef: closeButtonRef,
    onEscape: onClose,
  });

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={styles.indexBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={dialogRef}
        className={styles.indexPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Training Method index"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header>
          <p className="eyebrow">Index</p>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </aside>
    </>,
    document.body,
  );
}
