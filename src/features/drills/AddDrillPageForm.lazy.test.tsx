import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDrillPageForm } from "./AddDrillPageForm";

const mocks = vi.hoisted(() => ({
  discardSheetLoaded: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/data/onboarding", () => ({
  createOnboardingFirstDrill: vi.fn(),
}));
vi.mock("@/features/capture/CaptureDiscardSheet", () => {
  mocks.discardSheetLoaded();
  return {
    CaptureDiscardSheet: ({
      open,
      onStay,
    }: {
      open: boolean;
      onStay: () => void;
    }) => (
      <div data-testid="manual-discard-sheet" data-open={open}>
        <button type="button" onClick={onStay}>Keep mocked drill</button>
      </div>
    ),
  };
});
vi.mock("@/features/journal/JournalUploadProvider", () => ({
  useJournalUpload: () => ({ setDrillId: vi.fn() }),
}));
vi.mock("@/features/onboarding/FirstDrillCommitContext", () => ({
  useFirstDrillCommit: () => ({ setCommitting: vi.fn() }),
}));
vi.mock("./AddDrillForm", () => ({
  AddDrillForm: ({
    onCancel,
    onDirtyChange,
  }: {
    onCancel?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onDirtyChange?.(true)}>Mark drill dirty</button>
      <button type="button" onClick={onCancel}>Cancel manual drill</button>
    </>
  ),
}));

describe("AddDrillPageForm lazy discard confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/drills/new?onboarding=1");
  });

  it("loads the drawer only when a dirty manual drill attempts to exit", async () => {
    render(<AddDrillPageForm fromJournal={false} onboarding nextPath="/" />);

    expect(mocks.discardSheetLoaded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark drill dirty" }));
    await waitFor(() => expect(window.history.state?.__manualDrillGuard).toBeTruthy());
    expect(mocks.discardSheetLoaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel manual drill" }));
    await waitFor(() => expect(mocks.discardSheetLoaded).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Discard this drill?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel manual drill" }));
    expect(await screen.findByTestId("manual-discard-sheet")).toHaveAttribute("data-open", "true");
  });
});
