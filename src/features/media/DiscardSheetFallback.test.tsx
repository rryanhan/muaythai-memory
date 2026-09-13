import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiscardSheetFallback } from "./DiscardSheetFallback";

it("keeps a deferred discard confirmation accessible and fully actionable", async () => {
  const originalBodyStyle = document.body.getAttribute("style");
  const originalBodyInert = document.body.getAttribute("inert");
  const originalBodyAriaHidden = document.body.getAttribute("aria-hidden");
  const opener = document.createElement("button");
  const appRoot = document.createElement("div");
  const preservedBackground = document.createElement("aside");
  appRoot.setAttribute("aria-hidden", "false");
  preservedBackground.setAttribute("inert", "preserved");
  preservedBackground.setAttribute("aria-hidden", "false");
  document.body.append(opener);
  document.body.append(appRoot, preservedBackground);
  document.body.style.setProperty("overflow-x", "clip", "important");
  document.body.style.setProperty("overflow-y", "auto");
  opener.focus();
  const onStay = vi.fn();
  const onDiscard = vi.fn();
  const { unmount } = render(
    <DiscardSheetFallback
      backdropClassName="backdrop"
      sheetClassName="sheet"
      actionsClassName="actions"
      title="Discard this drill?"
      description="Your unsaved drill will be lost."
      statusMessage="Loading enhanced confirmation…"
      stayLabel="Keep editing"
      discardLabel="Discard drill"
      onStay={onStay}
      onDiscard={onDiscard}
    />,
    { container: appRoot },
  );

  const dialog = screen.getByRole("dialog", { name: "Discard this drill?" });
  const stay = screen.getByRole("button", { name: "Keep editing" });
  const discard = screen.getByRole("button", { name: "Discard drill" });
  expect(screen.getByText("Your unsaved drill will be lost.")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading enhanced confirmation…");
  expect(dialog.parentElement).toBe(document.body);
  expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");
  expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
  expect(document.body.getAttribute("inert")).toBe(originalBodyInert);
  expect(document.body.getAttribute("aria-hidden")).toBe(originalBodyAriaHidden);
  expect(appRoot).toHaveAttribute("inert", "");
  expect(appRoot).toHaveAttribute("aria-hidden", "true");
  expect(preservedBackground).toHaveAttribute("inert", "");
  expect(preservedBackground).toHaveAttribute("aria-hidden", "true");
  expect(opener).toHaveAttribute("inert", "");
  expect(opener).toHaveAttribute("aria-hidden", "true");
  await waitFor(() => expect(stay).toHaveFocus());

  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(discard).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(stay).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(discard).toHaveFocus();

  fireEvent.click(discard);
  expect(onDiscard).toHaveBeenCalledOnce();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onStay).toHaveBeenCalledOnce();
  fireEvent.click(document.querySelector(".backdrop")!);
  expect(onStay).toHaveBeenCalledTimes(2);

  unmount();
  expect(opener).toHaveFocus();
  expect(document.body.style.getPropertyValue("overflow-x")).toBe("clip");
  expect(document.body.style.getPropertyPriority("overflow-x")).toBe("important");
  expect(document.body.style.getPropertyValue("overflow-y")).toBe("auto");
  expect(document.body.style.getPropertyPriority("overflow-y")).toBe("");
  expect(document.body.getAttribute("inert")).toBe(originalBodyInert);
  expect(document.body.getAttribute("aria-hidden")).toBe(originalBodyAriaHidden);
  expect(appRoot).not.toHaveAttribute("inert");
  expect(appRoot).toHaveAttribute("aria-hidden", "false");
  expect(preservedBackground).toHaveAttribute("inert", "preserved");
  expect(preservedBackground).toHaveAttribute("aria-hidden", "false");
  expect(opener).not.toHaveAttribute("inert");
  expect(opener).not.toHaveAttribute("aria-hidden");

  opener.remove();
  appRoot.remove();
  preservedBackground.remove();
  if (originalBodyStyle === null) document.body.removeAttribute("style");
  else document.body.setAttribute("style", originalBodyStyle);
});
