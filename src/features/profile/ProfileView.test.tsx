import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileView } from "./ProfileView";

const mocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  getFriendsSummary: vi.fn(),
  getJournalEntries: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("@/data", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data")>(),
  getDrills: mocks.getDrills,
  getFriendsSummary: mocks.getFriendsSummary,
  getJournalEntries: mocks.getJournalEntries,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mocks.prefetch }),
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
    mocks.getFriendsSummary.mockResolvedValue({
      counts: {
        friends: 4,
        incoming: 3,
        outgoing: 1,
        blocked: 0,
      },
    });
  });

  it("shows the incoming-request count as a dedicated Friends badge", async () => {
    renderProfile();

    expect(await screen.findByLabelText("3 pending friend requests")).toHaveTextContent("3");
    expect(screen.getByText("Friends").closest("a")).toHaveAttribute(
      "href",
      "/friends",
    );
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
