"use client";

import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";

type ModalFallbackAccessibilityOptions = {
  backdropRef: RefObject<HTMLElement | null>;
  dialogRef: RefObject<HTMLElement | null>;
  fallbackReturnFocusRef?: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
};

type AttributeSnapshot = {
  element: Element;
  ariaHidden: string | null;
  inert: string | null;
};

type StylePropertySnapshot = {
  value: string;
  priority: string;
};

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalFallbackAccessibility({
  backdropRef,
  dialogRef,
  fallbackReturnFocusRef,
  initialFocusRef,
  onEscape,
}: ModalFallbackAccessibilityOptions) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const body = document.body;
    const fallbackReturnFocus = fallbackReturnFocusRef?.current ?? null;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const overflow = snapshotStyleProperty(body.style, "overflow");
    const overflowX = snapshotStyleProperty(body.style, "overflow-x");
    const overflowY = snapshotStyleProperty(body.style, "overflow-y");
    const modalElements = new Set<Element>(
      [backdropRef.current, dialogRef.current].filter(
        (element): element is HTMLElement => element !== null,
      ),
    );
    const backgroundElements = Array.from(body.children)
      .filter((element) => !modalElements.has(element))
      .map(snapshotAttributes);

    for (const { element } of backgroundElements) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    body.style.setProperty("overflow", "hidden", "important");
    initialFocusRef.current?.focus();

    return () => {
      body.style.removeProperty("overflow");
      if (overflow.value) {
        restoreStyleProperty(body.style, "overflow", overflow);
      } else {
        restoreStyleProperty(body.style, "overflow-x", overflowX);
        restoreStyleProperty(body.style, "overflow-y", overflowY);
      }

      for (const snapshot of backgroundElements) restoreAttributes(snapshot);

      const capturedFocus = returnFocusRef.current;
      const returnFocus = capturedFocus?.isConnected
        && capturedFocus !== document.body
        && capturedFocus !== document.documentElement
        ? capturedFocus
        : fallbackReturnFocus ?? capturedFocus;
      returnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [backdropRef, dialogRef, fallbackReturnFocusRef, initialFocusRef]);

  return function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => (
      element.tabIndex >= 0
      && element.closest("[hidden], [inert], [aria-hidden='true']") === null
    ));

    event.preventDefault();
    if (focusableElements.length === 0) {
      dialog.focus();
      return;
    }

    const activeIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex = activeIndex === -1
      ? event.shiftKey ? focusableElements.length - 1 : 0
      : (activeIndex + direction + focusableElements.length) % focusableElements.length;
    focusableElements[nextIndex]?.focus();
  };
}

function snapshotAttributes(element: Element): AttributeSnapshot {
  return {
    element,
    ariaHidden: element.getAttribute("aria-hidden"),
    inert: element.getAttribute("inert"),
  };
}

function restoreAttributes({ element, ariaHidden, inert }: AttributeSnapshot) {
  restoreAttribute(element, "aria-hidden", ariaHidden);
  restoreAttribute(element, "inert", inert);
}

function restoreAttribute(element: Element, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function snapshotStyleProperty(style: CSSStyleDeclaration, property: string): StylePropertySnapshot {
  return {
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  };
}

function restoreStyleProperty(
  style: CSSStyleDeclaration,
  property: string,
  { value, priority }: StylePropertySnapshot,
) {
  if (value) style.setProperty(property, value, priority);
  else style.removeProperty(property);
}
