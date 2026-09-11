import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileView } from "./ProfileView";

const mocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  getConnectionsSummary: vi.fn(),
  getJournalEntries: vi.fn(),
  linkProps: vi.fn(),
}));

vi.mock("@/data/drills", () => ({
  getDrills: mocks.getDrills,
}));
vi.mock("@/data/journal", () => ({
  getJournalEntries: mocks.getJournalEntries,
}));
vi.mock("@/data/connections", () => ({
  getConnectionsSummary: mocks.getConnectionsSummary,
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => {
    mocks.linkProps(prefetch === undefined ? props : { ...props, prefetch });
    return <a {...props}>{children}</a>;
  },
}));
vi.mock("@/features/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign Out</button>,
}));
vi.mock("./ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));

describe("ProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDrills.mockResolvedValue({ drills: [] });
    mocks.getJournalEntries.mockResolvedValue({
      entries: [],
      nextCursor: null,
    });
    mocks.getConnectionsSummary.mockResolvedValue({
      counts: {
        followers: 4,
        following: 2,
        incoming: 3,
        outgoing: 1,
        blocked: 0,
      },
    });
  });

  it("shows drill, follower, and following counts beneath the username", async () => {
    renderProfile();

    expect(await screen.findByLabelText("3 pending follow requests")).toHaveTextContent("3");
    expect(screen.getByText("Followers").closest("a")).toHaveAttribute(
      "href",
      "/connections?tab=followers",
    );
    expect(screen.getByText("Following").closest("a")).toHaveAttribute(
      "href",
      "/connections?tab=following",
    );
  });

  it("links journal rows without forcing or manually triggering full-route prefetches", async () => {
    mocks.getJournalEntries.mockResolvedValue({
      entries: [{
        id: "00000000-0000-4000-8000-000000000201",
        occurredOn: "2026-09-10",
        caption: "Checked the rear-kick return",
        drill: null,
        durationMs: 12_000,
        mimeType: "video/mp4",
        posterUrl: null,
        createdAt: new Date("2026-09-10T12:00:00Z"),
      }],
      nextCursor: null,
    });
    renderProfile();

    const link = await screen.findByRole("link", { name: /checked the rear-kick return/i });
    expect(link).toHaveAttribute("href", "/journal/00000000-0000-4000-8000-000000000201");
    const props = mocks.linkProps.mock.calls
      .map(([value]) => value)
      .find((value) => value.href === "/journal/00000000-0000-4000-8000-000000000201");
    expect(props).toBeDefined();
    expect(props).not.toHaveProperty("prefetch");
    expect(props).not.toHaveProperty("onFocus");
    expect(props).not.toHaveProperty("onPointerEnter");
    expect(props).not.toHaveProperty("onTouchStart");
  });
});

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileView currentUser={currentUser} />
    </QueryClientProvider>,
  );
}

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
