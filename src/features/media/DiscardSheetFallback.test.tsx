import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiscardSheetFallback } from "./DiscardSheetFallback";

it("keeps a deferred discard confirmation accessible and fully actionable", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
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
  );

  const dialog = screen.getByRole("dialog", { name: "Discard this drill?" });
  const stay = screen.getByRole("button", { name: "Keep editing" });
  const discard = screen.getByRole("button", { name: "Discard drill" });
  expect(screen.getByText("Your unsaved drill will be lost.")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading enhanced confirmation…");
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
  opener.remove();
});
