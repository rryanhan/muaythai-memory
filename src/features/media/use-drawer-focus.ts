"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useDrawerFocus(open: boolean): RefObject<HTMLDivElement | null> {
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const timer = window.setTimeout(() => {
      const initialFocus = contentRef.current?.querySelector<HTMLElement>("[data-drawer-initial-focus]");
      initialFocus?.focus();
    });

    return () => {
      window.clearTimeout(timer);
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [open]);

  return contentRef;
}
