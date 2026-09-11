import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileEditScreen } from "./ProfileEditScreen";

const mocks = vi.hoisted(() => ({
  discardSheetLoaded: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));
vi.mock("./ProfileEditForm", () => ({
  ProfileEditForm: ({
    onCancel,
    onDirtyChange,
  }: {
    onCancel: () => void;
    onDirtyChange: (dirty: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onDirtyChange(true)}>Mark profile dirty</button>
      <button type="button" onClick={onCancel}>Cancel profile edit</button>
    </>
  ),
}));
vi.mock("./ProfileDiscardSheet", () => {
  mocks.discardSheetLoaded();
  return {
    ProfileDiscardSheet: ({
      open,
      onStay,
    }: {
      open: boolean;
      onStay: () => void;
    }) => (
      <div data-testid="profile-discard-sheet" data-open={open}>
        <button type="button" onClick={onStay}>Keep mocked profile</button>
      </div>
    ),
  };
});

describe("ProfileEditScreen lazy discard confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/profile/edit");
  });

  it("defers the drawer until dirty navigation and reuses it after closing", async () => {
    render(<ProfileEditScreen currentUser={currentUser} />);

    expect(mocks.discardSheetLoaded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark profile dirty" }));
    await waitFor(() => expect(window.history.state?.__profileGuard).toBeTruthy());
    expect(mocks.discardSheetLoaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel profile edit" }));
    await waitFor(() => expect(mocks.discardSheetLoaded).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Discard profile changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel profile edit" }));
    expect(await screen.findByTestId("profile-discard-sheet")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByRole("button", { name: "Keep mocked profile" }));
    expect(screen.getByTestId("profile-discard-sheet")).toHaveAttribute("data-open", "false");
  });
});

const currentUser: CurrentAppUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "current_fighter",
  username: "current_fighter",
  firstName: null,
  lastName: null,
  location: null,
  avatarUrl: null,
  email: "current@example.com",
  profileOnboardedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideCompletedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideSkippedAt: null,
};
