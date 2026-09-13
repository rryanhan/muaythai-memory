import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileEditScreen } from "./ProfileEditScreen";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/data/profile", () => ({
  updateProfile: mocks.updateProfile,
}));

vi.mock("./ProfileAvatar", () => ({
  ProfileAvatar: () => <span>Avatar preview</span>,
}));

vi.mock("./ProfileDiscardSheet", () => ({
  ProfileDiscardSheet: ({
    open,
    onStay,
    onDiscard,
  }: {
    open: boolean;
    onStay: () => void;
    onDiscard: () => void;
  }) => (
    <div
      role={open ? "dialog" : undefined}
      aria-label="Discard profile changes confirmation"
      data-open={open}
      data-testid="enhanced-discard-sheet"
    >
      <button type="button" onClick={onStay}>Keep editing</button>
      <button type="button" onClick={onDiscard}>Discard changes</button>
    </div>
  ),
}));

describe("ProfileEditScreen save navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ entry: "profile-edit" }, "", "/profile/edit");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks every visible exit while saving and navigates exactly once after success", async () => {
    const save = deferred<void>();
    mocks.updateProfile.mockReturnValueOnce(save.promise);

    const { container } = render(<ProfileEditScreen currentUser={currentUser} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
      target: { value: "updated_fighter" },
    });
    await waitFor(() => expect(window.history.state?.__profileGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Username" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /First name/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Last name/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Location/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back to Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Discard profile changes?" })).not.toBeInTheDocument();

    await act(async () => {
      save.resolve();
      await save.promise;
    });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/?view=profile");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(window.history.state?.__profileGuard).toBeUndefined();
  });

  it("restores browser history while pending and restores the dirty guard and retry after an error", async () => {
    const save = deferred<void>();
    mocks.updateProfile.mockReturnValueOnce(save.promise);
    const historyForward = vi.spyOn(window.history, "forward");

    render(<ProfileEditScreen currentUser={currentUser} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
      target: { value: "updated_fighter" },
    });
    await waitFor(() => expect(window.history.state?.__profileGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Back to Profile" }));
    expect(await screen.findByRole("dialog", { name: "Discard profile changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to Profile" }));
    expect(await screen.findByRole("dialog", { name: "Discard profile changes confirmation" }))
      .toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByTestId("enhanced-discard-sheet")).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    const downstreamPopState = vi.fn();
    window.addEventListener("popstate", downstreamPopState);
    window.history.replaceState({ entry: "previous" }, "", "/profile/edit");
    window.dispatchEvent(new PopStateEvent("popstate", { state: { entry: "previous" } }));
    expect(window.history.state?.__profileGuard).toBeTruthy();
    window.history.replaceState({ entry: "older" }, "", "/profile/edit");
    window.dispatchEvent(new PopStateEvent("popstate", { state: { entry: "older" } }));
    window.removeEventListener("popstate", downstreamPopState);

    expect(historyForward).not.toHaveBeenCalled();
    expect(window.history.state?.__profileGuard).toBeTruthy();
    expect(downstreamPopState).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Discard profile changes?" })).not.toBeInTheDocument();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await act(async () => {
      save.reject(new Error("Profile service unavailable."));
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Profile service unavailable.");
    expect(screen.getByRole("button", { name: "Back to Profile" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Back to Profile" }));
    expect(await screen.findByRole("dialog", { name: "Discard profile changes confirmation" }))
      .toHaveAttribute("data-open", "true");
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    mocks.updateProfile.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile).toHaveBeenCalledTimes(2);
  });

  it("restores the guard synchronously when Back interleaves with save completion", async () => {
    const save = deferred<void>();
    mocks.updateProfile.mockReturnValueOnce(save.promise);
    const historyForward = vi.spyOn(window.history, "forward");
    mocks.replace.mockImplementation((destination: string) => {
      window.history.replaceState({}, "", destination);
    });

    render(<ProfileEditScreen currentUser={currentUser} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
      target: { value: "updated_fighter" },
    });
    const guardKey = await waitFor(() => {
      expect(window.history.state?.__profileGuard).toBeTruthy();
      return window.history.state.__profileGuard;
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();

    window.history.replaceState({ entry: "profile-edit" }, "", "/profile/edit");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    expect(window.history.state?.__profileGuard).toBe(guardKey);
    expect(historyForward).not.toHaveBeenCalled();

    await act(async () => {
      save.resolve();
      await save.promise;
    });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(window.history.state?.__profileGuard).toBeUndefined();
  });

  it("returns to the original previous entry after dirty Back and confirmed discard", async () => {
    window.history.replaceState({ entry: "previous" }, "", "/profile/previous");
    window.history.pushState({ entry: "profile-edit" }, "", "/profile/edit");
    render(<ProfileEditScreen currentUser={currentUser} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
      target: { value: "updated_fighter" },
    });
    await waitFor(() => expect(window.history.state?.__profileGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard profile changes?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/profile/edit");
    expect(window.history.state?.__profileGuard).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(window.location.pathname).toBe("/profile/previous"));
    expect(window.history.state?.entry).toBe("previous");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "does not navigate when a pending profile save %s after the screen unmounts",
    async (settlement) => {
      const save = deferred<void>();
      mocks.updateProfile.mockReturnValueOnce(save.promise);

      const { unmount } = render(<ProfileEditScreen currentUser={currentUser} />);
      fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
        target: { value: "updated_fighter" },
      });
      await waitFor(() => expect(window.history.state?.__profileGuard).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();

      unmount();
      await act(async () => {
        if (settlement === "resolve") save.resolve();
        else save.reject(new Error("Save failed after screen unmount."));
        await Promise.resolve();
      });

      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

const currentUser: CurrentAppUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "current_fighter",
  username: "current_fighter",
  firstName: null,
  lastName: null,
  location: null,
  avatarUrl: "https://example.com/avatar.webp",
  email: "current@example.com",
  profileOnboardedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideCompletedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideSkippedAt: null,
};
