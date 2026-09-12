"use client";

import { lazy, Suspense, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { useModalFallbackAccessibility } from "@/components/shared/useModalFallbackAccessibility";
import styles from "./DrillShare.module.css";

const DrillShareSheet = lazy(
  () => import("./DrillShareSheet")
    .then((module) => ({ default: module.DrillShareSheet })),
);

export function DrillShareButton({ drillId }: { drillId: string }) {
  const [sheetMounted, setSheetMounted] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        aria-label="Share drill with connections"
        title="Share drill"
        onClick={() => {
          setSheetMounted(true);
          setOpen(true);
        }}
      >
        <ShareNetwork size={19} weight="bold" aria-hidden="true" />
      </button>
      {sheetMounted && (
        <Suspense fallback={open ? <DrillShareSheetLoading onCancel={() => setOpen(false)} /> : null}>
          <DrillShareSheet drillId={drillId} open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

function DrillShareSheetLoading({ onCancel }: { onCancel: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    initialFocusRef: doneButtonRef,
    onEscape: onCancel,
  });

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={styles.backdrop}
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${statusId}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className={styles.heading}>
          <div>
            <h2 id={titleId}>Share Drill</h2>
            <p id={descriptionId}>Choose fighters you follow each other with.</p>
          </div>
          <button ref={doneButtonRef} type="button" onClick={onCancel}>Done</button>
        </div>
        <p id={statusId} className={styles.state} role="status" aria-live="polite">
          Loading sharing options…
        </p>
      </div>
    </>,
    document.body,
  );
}
