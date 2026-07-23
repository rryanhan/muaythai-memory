import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDraftScreen } from "./CaptureDraftScreen";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));
vi.mock("./CaptureDiscardSheet", () => ({
  CaptureDiscardSheet: () => null,
}));
vi.mock("./CaptureDraftForm", () => ({
  CaptureDraftForm: (props: {
    onCreationCommitChange?: (committing: boolean) => void;
    onSaveSuccess?: (drillId: string) => void;
    onWorkflowChange?: (state: {
      mode: "voice";
      phase: "review";
      hasUnsavedWork: boolean;
    }) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => props.onWorkflowChange?.({
          mode: "voice",
          phase: "review",
          hasUnsavedWork: true,
        })}
      >
        Mark draft dirty
      </button>
      <button
        type="button"
        onClick={() => props.onCreationCommitChange?.(true)}
      >
        Start creation commit
      </button>
      <button
        type="button"
        onClick={() => props.onCreationCommitChange?.(false)}
      >
        Finish creation commit
      </button>
      <button
        type="button"
        onClick={() => props.onSaveSuccess?.("00000000-0000-4000-8000-000000000010")}
      >
        Finish save
      </button>
    </>
  ),
}));

describe("CaptureDraftScreen creation navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ entry: "oldest" }, "", "/history/oldest");
    window.history.pushState({ entry: "middle" }, "", "/history/middle");
    window.history.pushState({}, "", "/onboarding/first-drill");
  });

  it("restores the guard after repeated multi-entry navigation and releases it for save navigation", async () => {
    const user = userEvent.setup();
    const onSkipFirstDrill = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState");
    render(
      <CaptureDraftScreen
        initialMode="voice"
        origin="library"
        onboarding={{
          createAction: vi.fn(),
          onSkipFirstDrill,
          onUseManual: vi.fn(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark draft dirty" }));
    const guardedUrl = window.location.href;
    await waitFor(() => {
      expect(window.history.state?.__captureGuard).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Start creation commit" }));

    expect(screen.getByRole("button", { name: "Exit Capture Drill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip first drill" })).toBeDisabled();

    window.history.go(-3);
    await waitFor(() => {
      expect(pushState).toHaveBeenCalledTimes(2);
    });
    expect(window.location.href).toBe(guardedUrl);
    expect(window.history.state?.__captureGuard).toBeTruthy();

    window.history.go(-1);
    await waitFor(() => {
      expect(pushState).toHaveBeenCalledTimes(3);
    });
    expect(window.location.href).toBe(guardedUrl);
    expect(window.history.state?.__captureGuard).toBeTruthy();
    expect(onSkipFirstDrill).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish save" }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/drills/00000000-0000-4000-8000-000000000010",
      );
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});
