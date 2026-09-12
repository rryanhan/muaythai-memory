import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, expect, it, vi } from "vitest";
import { DrillShareButton } from "./DrillShareButton";

const mocks = vi.hoisted(() => ({
  shareSheetLoaded: vi.fn(),
}));

const shareSheetModule = vi.hoisted(() => {
  let resolve!: () => void;
  const gate = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { gate, resolve };
});

let originalBodyStyle: string | null | undefined;
let preservedBackground: HTMLElement | null = null;

vi.mock("./DrillShareSheet", async () => {
  mocks.shareSheetLoaded();
  await shareSheetModule.gate;
  return {
    DrillShareSheet: ({
      drillId,
      open,
      onClose,
    }: {
      drillId: string;
      open: boolean;
      onClose: () => void;
    }) => (
      <div data-testid="drill-share-sheet" data-drill-id={drillId} data-open={open}>
        {open && <button type="button" onClick={onClose}>Close mocked share</button>}
      </div>
    ),
  };
});

afterAll(() => {
  shareSheetModule.resolve();
  restoreBodyStyle();
  preservedBackground?.remove();
});

it("loads the share sheet once after first interaction and provides an accessible cold fallback", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <DrillShareButton drillId="00000000-0000-4000-8000-000000000001" />,
  );
  originalBodyStyle = document.body.getAttribute("style");
  const originalBodyInert = document.body.getAttribute("inert");
  const originalBodyAriaHidden = document.body.getAttribute("aria-hidden");
  document.body.style.setProperty("overflow-x", "clip", "important");
  document.body.style.setProperty("overflow-y", "auto");
  container.setAttribute("aria-hidden", "false");
  const existingBackground = document.createElement("aside");
  existingBackground.setAttribute("inert", "preserved");
  existingBackground.setAttribute("aria-hidden", "true");
  preservedBackground = existingBackground;
  document.body.append(existingBackground);

  expect(mocks.shareSheetLoaded).not.toHaveBeenCalled();
  expect(screen.queryByTestId("drill-share-sheet")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Share Drill" })).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Share drill with connections" });
  await user.click(trigger);

  const loadingDialog = await screen.findByRole("dialog", { name: "Share Drill" });
  expect(container).not.toContainElement(loadingDialog);
  expect(loadingDialog.parentElement).toBe(document.body);
  expect(within(loadingDialog).getByRole("status")).toHaveTextContent(
    "Loading sharing options…",
  );
  await waitFor(() => {
    expect(document.body.style.overflow).toBe("hidden");
    expect(container).toHaveAttribute("inert", "");
    expect(container).toHaveAttribute("aria-hidden", "true");
  });
  expect(document.body.getAttribute("inert")).toBe(originalBodyInert);
  expect(document.body.getAttribute("aria-hidden")).toBe(originalBodyAriaHidden);
  expect(existingBackground).toHaveAttribute("inert", "");
  expect(existingBackground).toHaveAttribute("aria-hidden", "true");
  expect(mocks.shareSheetLoaded).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("drill-share-sheet")).not.toBeInTheDocument();

  const done = within(loadingDialog).getByRole("button", { name: "Done" });
  await waitFor(() => expect(done).toHaveFocus());
  fireEvent.keyDown(loadingDialog, { key: "Tab" });
  expect(done).toHaveFocus();
  fireEvent.keyDown(loadingDialog, { key: "Tab", shiftKey: true });
  expect(done).toHaveFocus();
  fireEvent.keyDown(loadingDialog, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Share Drill" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflowX).toBe("clip");
    expect(document.body.style.getPropertyPriority("overflow-x")).toBe("important");
    expect(document.body.style.overflowY).toBe("auto");
    expect(document.body.style.getPropertyPriority("overflow-y")).toBe("");
    expect(container).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "false");
  });
  expect(existingBackground).toHaveAttribute("inert", "preserved");
  expect(existingBackground).toHaveAttribute("aria-hidden", "true");

  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Share Drill" })).toBeInTheDocument();
  await act(async () => {
    shareSheetModule.resolve();
    await shareSheetModule.gate;
  });

  const shareSheet = await screen.findByTestId("drill-share-sheet");
  await waitFor(() => {
    expect(document.body.style.overflowX).toBe("clip");
    expect(document.body.style.getPropertyPriority("overflow-x")).toBe("important");
    expect(document.body.style.overflowY).toBe("auto");
    expect(container).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "false");
  });
  expect(shareSheet).toHaveAttribute(
    "data-drill-id",
    "00000000-0000-4000-8000-000000000001",
  );
  expect(shareSheet).toHaveAttribute("data-open", "true");
  await user.click(screen.getByRole("button", { name: "Close mocked share" }));
  expect(shareSheet).toHaveAttribute("data-open", "false");

  await user.click(trigger);
  expect(shareSheet).toHaveAttribute("data-open", "true");
  expect(mocks.shareSheetLoaded).toHaveBeenCalledOnce();

  restoreBodyStyle();
  existingBackground.remove();
  preservedBackground = null;
});

function restoreBodyStyle() {
  if (originalBodyStyle === undefined) return;
  if (originalBodyStyle === null) document.body.removeAttribute("style");
  else document.body.setAttribute("style", originalBodyStyle);
  originalBodyStyle = undefined;
}
