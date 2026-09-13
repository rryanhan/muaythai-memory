import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SheetLoadingFallback } from "./SheetLoadingFallback";

it("keeps a deferred sheet visible, modal, dismissible, and keyboard-contained", async () => {
  const originalBodyStyle = document.body.getAttribute("style");
  const opener = document.createElement("button");
  const appRoot = document.createElement("main");
  const preservedBackground = document.createElement("aside");
  appRoot.setAttribute("aria-hidden", "false");
  preservedBackground.setAttribute("inert", "preserved");
  preservedBackground.setAttribute("aria-hidden", "false");
  document.body.append(opener, appRoot, preservedBackground);
  document.body.style.setProperty("overflow-x", "clip", "important");
  document.body.style.setProperty("overflow-y", "auto");
  opener.focus();
  const onClose = vi.fn();
  const { unmount } = render(
    <SheetLoadingFallback
      backdropClassName="fixture-backdrop"
      sheetClassName="fixture-sheet"
      title="Filter Drills"
      description="Tag filters are still loading."
      statusMessage="Loading filters…"
      onClose={onClose}
    />,
    { container: appRoot },
  );

  const dialog = screen.getByRole("dialog", { name: "Filter Drills" });
  const close = within(dialog).getByRole("button", { name: "Close" });
  expect(dialog.parentElement).toBe(document.body);
  expect(within(dialog).getByText("Tag filters are still loading.")).toBeInTheDocument();
  expect(within(dialog).getByRole("status")).toHaveTextContent("Loading filters…");
  expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");
  expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
  expect(appRoot).toHaveAttribute("inert", "");
  expect(appRoot).toHaveAttribute("aria-hidden", "true");
  expect(preservedBackground).toHaveAttribute("inert", "");
  expect(preservedBackground).toHaveAttribute("aria-hidden", "true");
  await waitFor(() => expect(close).toHaveFocus());

  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(close).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.click(document.querySelector(".fixture-backdrop")!);
  expect(onClose).toHaveBeenCalledTimes(2);
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledTimes(3);

  unmount();
  expect(opener).toHaveFocus();
  expect(document.body.style.getPropertyValue("overflow-x")).toBe("clip");
  expect(document.body.style.getPropertyPriority("overflow-x")).toBe("important");
  expect(document.body.style.getPropertyValue("overflow-y")).toBe("auto");
  expect(appRoot).not.toHaveAttribute("inert");
  expect(appRoot).toHaveAttribute("aria-hidden", "false");
  expect(preservedBackground).toHaveAttribute("inert", "preserved");
  expect(preservedBackground).toHaveAttribute("aria-hidden", "false");

  opener.remove();
  appRoot.remove();
  preservedBackground.remove();
  if (originalBodyStyle === null) document.body.removeAttribute("style");
  else document.body.setAttribute("style", originalBodyStyle);
});
