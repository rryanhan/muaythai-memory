import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDraftScreen } from "./CaptureDraftScreen";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));
vi.mock("./CaptureDraftForm", () => ({
  CaptureDraftForm: () => <div data-testid="draft-state">Unsaved transcript</div>,
}));
vi.mock("./CaptureDiscardSheet", () => {
  throw new Error("simulated chunk load failure");
});

describe("CaptureDraftScreen failed discard chunk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.history.replaceState({}, "", "/onboarding/first-drill");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the form and exposes a complete standard confirmation", async () => {
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

    expect(screen.getByTestId("draft-state")).toHaveTextContent("Unsaved transcript");
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await waitFor(() => expect(console.error).toHaveBeenCalledWith(
      "Could not load the enhanced capture discard confirmation.",
      expect.any(Error),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog", { name: "Skip your first drill?" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip first drill" }));
    expect(await screen.findByText(
      "Enhanced confirmation could not load. Standard confirmation remains available.",
    )).toBeInTheDocument();
    expect(screen.getByTestId("draft-state")).toBeInTheDocument();
  });
});
