import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDraftScreen } from "./CaptureDraftScreen";

const mocks = vi.hoisted(() => ({
  discardSheetLoaded: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));
vi.mock("./CaptureDraftForm", () => ({
  CaptureDraftForm: () => null,
}));
vi.mock("./CaptureDiscardSheet", () => {
  mocks.discardSheetLoaded();
  return {
    CaptureDiscardSheet: ({
      open,
      onStay,
    }: {
      open: boolean;
      onStay: () => void;
    }) => (
      <div data-testid="capture-discard-sheet" data-open={open}>
        <button type="button" onClick={onStay}>Keep mocked capture</button>
      </div>
    ),
  };
});

describe("CaptureDraftScreen lazy discard confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/onboarding/first-drill");
  });

  it("does not load the drawer until a confirmation is requested and keeps it mounted", async () => {
    render(
      <CaptureDraftScreen
        initialMode="voice"
        origin="library"
        onboarding={{
          createAction: vi.fn(),
          onSkipFirstDrill: vi.fn(),
          onUseManual: vi.fn(),
        }}
      />,
    );

    expect(mocks.discardSheetLoaded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip first drill" }));

    await waitFor(() => expect(mocks.discardSheetLoaded).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Skip your first drill?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog", { name: "Skip your first drill?" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip first drill" }));
    expect(await screen.findByTestId("capture-discard-sheet")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByRole("button", { name: "Keep mocked capture" }));
    expect(screen.getByTestId("capture-discard-sheet")).toHaveAttribute("data-open", "false");
  });
});
