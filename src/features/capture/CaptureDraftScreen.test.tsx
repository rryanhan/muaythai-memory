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
    </>
  ),
}));

describe("CaptureDraftScreen creation navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/onboarding/first-drill");
  });

  it("disables exits and reverses browser navigation while Save is committing", async () => {
    const user = userEvent.setup();
    const onSkipFirstDrill = vi.fn();
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
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
    await waitFor(() => {
      expect(window.history.state?.__captureGuard).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Start creation commit" }));

    expect(screen.getByRole("button", { name: "Exit Capture Drill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip first drill" })).toBeDisabled();

    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(onSkipFirstDrill).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish creation commit" }));
    expect(screen.getByRole("button", { name: "Exit Capture Drill" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip first drill" })).toBeEnabled();
  });
});
