import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDrillPageForm } from "./AddDrillPageForm";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  setCommitting: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/data/onboarding", () => ({
  createOnboardingFirstDrill: vi.fn(),
}));
vi.mock("@/features/capture/CaptureDiscardSheet", () => ({
  CaptureDiscardSheet: () => null,
}));
vi.mock("@/features/journal/JournalUploadProvider", () => ({
  useJournalUpload: () => ({ setDrillId: vi.fn() }),
}));
vi.mock("@/features/onboarding/FirstDrillCommitContext", () => ({
  useFirstDrillCommit: () => ({ setCommitting: mocks.setCommitting }),
}));
vi.mock("./AddDrillForm", () => ({
  AddDrillForm: (props: {
    onCreationCommitChange?: (committing: boolean) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaveSuccess?: (drillId: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>
        Mark manual drill dirty
      </button>
      <button type="button" onClick={() => props.onCreationCommitChange?.(true)}>
        Start manual save
      </button>
      <button
        type="button"
        onClick={() => props.onSaveSuccess?.("00000000-0000-4000-8000-000000000020")}
      >
        Finish manual save
      </button>
    </>
  ),
}));

describe("AddDrillPageForm onboarding creation navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ entry: "oldest" }, "", "/manual-history/oldest");
    window.history.pushState({ entry: "middle" }, "", "/manual-history/middle");
    window.history.pushState({}, "", "/drills/new?onboarding=1");
  });

  it("restores repeated multi-entry escapes and preserves post-save navigation", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    render(
      <AddDrillPageForm
        fromJournal={false}
        onboarding
        nextPath="/"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark manual drill dirty" }));
    const guardedUrl = window.location.href;
    await waitFor(() => {
      expect(window.history.state?.__manualDrillGuard).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Start manual save" }));

    window.history.go(-3);
    await waitFor(() => {
      expect(pushState).toHaveBeenCalledTimes(2);
    });
    expect(window.location.href).toBe(guardedUrl);
    expect(window.history.state?.__manualDrillGuard).toBeTruthy();

    window.history.go(-1);
    await waitFor(() => {
      expect(pushState).toHaveBeenCalledTimes(3);
    });
    expect(window.location.href).toBe(guardedUrl);
    expect(window.history.state?.__manualDrillGuard).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Finish manual save" }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/drills/00000000-0000-4000-8000-000000000020",
      );
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
