"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFallbackAccessibility } from "./useModalFallbackAccessibility";
import styles from "./SheetLoadingFallback.module.css";

type SheetLoadingFallbackProps = {
  backdropClassName: string;
  sheetClassName: string;
  title: string;
  description: string;
  statusMessage: string;
  closeLabel?: string;
  onClose: () => void;
};

export function SheetLoadingFallback({
  backdropClassName,
  sheetClassName,
  title,
  description,
  statusMessage,
  closeLabel = "Close",
  onClose,
}: SheetLoadingFallbackProps) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    initialFocusRef: closeButtonRef,
    onEscape: onClose,
  });

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={backdropClassName}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={`${sheetClassName} ${styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${statusId}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className={styles.header}>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            {closeLabel}
          </button>
        </header>
        <div className={styles.loadingState}>
          <p id={statusId} role="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
