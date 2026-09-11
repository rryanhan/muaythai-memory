import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDraftScreen } from "./CaptureDraftScreen";

const mocks = vi.hoisted(() => {
  let releaseLoad: () => void = () => undefined;
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });

  return {
    discardSheetLoadStarted: vi.fn(),
    discardSheetResolved: vi.fn(),
    loadGate,
    releaseLoad,
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));
vi.mock("./CaptureDraftForm", () => ({
  CaptureDraftForm: () => null,
}));
vi.mock("./CaptureDiscardSheet", async () => {
  mocks.discardSheetLoadStarted();
  await mocks.loadGate;
  mocks.discardSheetResolved();

  return {
    CaptureDiscardSheet: ({ open }: { open: boolean }) => (
      <div data-testid="delayed-discard-sheet" data-open={open} />
    ),
  };
});

describe("CaptureDraftScreen delayed discard chunk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/onboarding/first-drill");
  });

  it("keeps the native confirmation mounted until that opening closes", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Skip first drill" }));
    await waitFor(() => expect(mocks.discardSheetLoadStarted).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Skip your first drill?" })).toBeInTheDocument();

    mocks.releaseLoad();
    await waitFor(() => expect(mocks.discardSheetResolved).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: "Skip your first drill?" })).toBeInTheDocument();
    expect(screen.queryByTestId("delayed-discard-sheet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip first drill" }));
    expect(await screen.findByTestId("delayed-discard-sheet")).toHaveAttribute("data-open", "true");
  });
});
