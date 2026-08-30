import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");

  return {
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (onChange) => {
          window.addEventListener("app-shell-test-url-change", onChange);
          return () => window.removeEventListener("app-shell-test-url-change", onChange);
        },
        () => window.location.search,
        () => "",
      );
      return new URLSearchParams(search);
    },
  };
});

vi.mock("@/features/network/NetworkView", async () => {
  const { useState } = await import("react");

  return {
    NetworkView: () => {
      const [count, setCount] = useState(0);
      return (
        <button type="button" onClick={() => setCount((current) => current + 1)}>
          Network state {count}
        </button>
      );
    },
  };
});

vi.mock("@/features/library/LibraryView", () => ({
  LibraryView: () => <p>Training Log content</p>,
}));

vi.mock("@/features/profile/ProfileView", () => ({
  ProfileView: () => <p>Profile content</p>,
}));

describe("AppShell view lifecycle", () => {
  const nativeReplaceState = window.history.replaceState.bind(window.history);

  beforeEach(() => {
    nativeReplaceState({}, "", "/");
    vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
      nativeReplaceState(data, unused, url);
      window.dispatchEvent(new Event("app-shell-test-url-change"));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps every visited view mounted across bottom-nav and URL-driven navigation", () => {
    render(<AppShell currentUser={currentUser} initialView="network" />);

    fireEvent.click(screen.getByRole("button", { name: "Network state 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Training Log" }));

    expect(window.location.search).toBe("?view=library");
    expect(screen.getByLabelText("Training Log view")).toBeVisible();
    expect(screen.getByRole("button", { name: "Network state 1", hidden: true }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Network state 1", hidden: true }).closest(".app-view-pane"))
      .toHaveAttribute("hidden");

    act(() => window.history.replaceState({}, "", "/?view=profile"));
    expect(screen.getByText("Profile content")).toBeVisible();

    act(() => window.history.replaceState({}, "", "/?view=library"));
    expect(screen.getByText("Profile content").closest(".app-view-pane"))
      .toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(screen.getByRole("button", { name: "Network state 1" })).toBeVisible();
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
