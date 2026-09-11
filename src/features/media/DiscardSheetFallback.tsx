"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

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
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    stayButtonRef.current?.focus();

    return () => {
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return createPortal(
    <>
      <div className={backdropClassName} aria-hidden="true" onClick={onStay} />
      <div
        className={sheetClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusMessage ? `${descriptionId} ${statusId}` : descriptionId}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onStay();
            return;
          }

          if (event.key !== "Tab") return;
          event.preventDefault();
          const buttons = [stayButtonRef.current, discardButtonRef.current]
            .filter((button): button is HTMLButtonElement => button !== null);
          const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const direction = event.shiftKey ? -1 : 1;
          const nextIndex = activeIndex === -1
            ? event.shiftKey ? buttons.length - 1 : 0
            : (activeIndex + direction + buttons.length) % buttons.length;
          buttons[nextIndex]?.focus();
        }}
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
          <button ref={discardButtonRef} type="button" onClick={onDiscard}>
            {discardLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
