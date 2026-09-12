"use client";

import { lazy, Suspense, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
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
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(document.body.children)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement
        && element !== backdropRef.current
        && element !== dialogRef.current
      ))
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.getAttribute("inert"),
      }));

    for (const { element } of backgroundElements) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    doneButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { element, ariaHidden, inert } of backgroundElements) {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

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
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Tab") {
            event.preventDefault();
            doneButtonRef.current?.focus();
          }
        }}
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
