import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedFirstDrillForm } from "./GuidedFirstDrillForm";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  skipOnboardingFirstDrill: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));
vi.mock("@/data/onboarding", () => ({
  createOnboardingFirstDrill: vi.fn(),
  skipOnboardingFirstDrill: mocks.skipOnboardingFirstDrill,
}));
vi.mock("@/features/capture/CaptureDraftScreen", () => ({
  CaptureDraftScreen: (props: {
    onboarding?: {
      onSkipFirstDrill: () => Promise<string | null>;
    };
  }) => (
    <button
      type="button"
      onClick={() => void props.onboarding?.onSkipFirstDrill()}
    >
      Request skip
    </button>
  ),
}));

describe("GuidedFirstDrillForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("focuses a failed Skip and keeps the action recoverable", async () => {
    mocks.skipOnboardingFirstDrill.mockRejectedValue(
      new Error("The guide could not be skipped."),
    );
    const user = userEvent.setup();
    render(
      <GuidedFirstDrillForm
        initialMode="voice"
        nextPath="/?view=library"
        replay={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request skip" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent("The guide could not be skipped.");
    expect(screen.queryByText("Opening Training Log...")).not.toBeInTheDocument();
  });
});
