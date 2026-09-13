"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFallbackAccessibility } from "@/components/shared/useModalFallbackAccessibility";

type DiscardSheetFallbackProps = {
  backdropClassName: string;
  sheetClassName: string;
  actionsClassName: string;
  title: string;
  description: string;
  statusMessage?: string;
  stayLabel: string;
  discardLabel: string;
  onStay: () => void;
  onDiscard: () => void;
};

export function DiscardSheetFallback({
  backdropClassName,
  sheetClassName,
  actionsClassName,
  title,
  description,
  statusMessage,
  stayLabel,
  discardLabel,
  onStay,
  onDiscard,
}: DiscardSheetFallbackProps) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    initialFocusRef: stayButtonRef,
    onEscape: onStay,
  });

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={backdropClassName}
        aria-hidden="true"
        onClick={onStay}
      />
      <div
        ref={dialogRef}
        className={sheetClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusMessage ? `${descriptionId} ${statusId}` : descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {statusMessage ? (
          <p id={statusId} role="status" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}
        <div className={actionsClassName}>
          <button ref={stayButtonRef} type="button" onClick={onStay}>
            {stayLabel}
          </button>
          <button type="button" onClick={onDiscard}>
            {discardLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
