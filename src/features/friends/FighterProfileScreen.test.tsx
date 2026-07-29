import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FighterProfile } from "@/data/friends";
import { FighterProfileScreen } from "./FighterProfileScreen";

const mocks = vi.hoisted(() => ({
  getFighterProfile: vi.fn(),
  respondToFriendRequest: vi.fn(),
}));

vi.mock("@/data/friends", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/friends")>(),
  blockFighter: vi.fn(),
  cancelFriendRequest: vi.fn(),
  getFighterProfile: mocks.getFighterProfile,
  removeFriend: vi.fn(),
  reportFighter: vi.fn(),
  respondToFriendRequest: mocks.respondToFriendRequest,
  sendFriendRequest: vi.fn(),
  unblockFighter: vi.fn(),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));
vi.mock("./FriendConfirmationSheet", () => ({
  FriendConfirmationSheet: () => null,
}));
vi.mock("./FriendReportSheet", () => ({
  FriendReportSheet: () => null,
}));
vi.mock("./SharedDrillsSection", () => ({
  SharedDrillsSection: () => null,
}));
vi.mock("./FriendMoreActionsSheet", () => ({
  FriendMoreActionsSheet: ({
    open,
    onBlock,
  }: {
    open: boolean;
    onBlock: () => void;
  }) => open ? <button type="button" onClick={onBlock}>Block Fighter</button> : null,
}));

describe("FighterProfileScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading handoff instead of claiming accepted-friend totals are private", async () => {
    const profileRefresh = deferred<FighterProfile>();
    mocks.getFighterProfile.mockReturnValue(profileRefresh.promise);
    mocks.respondToFriendRequest.mockResolvedValue({
      userId: fighterProfile.profile.id,
      relationship: "friends",
    });
    const user = userEvent.setup();
    renderScreen(fighterProfile);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText("Loading your friend’s training totals…"))
      .toBeInTheDocument();
    expect(screen.queryByText("Training totals appear after you become friends."))
      .not.toBeInTheDocument();

    profileRefresh.resolve({
      ...fighterProfile,
      relationship: "friends",
      stats: {
        drillCount: 4,
        trainingMethods: [],
      },
    });

    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.queryByText("Loading your friend’s training totals…"))
      .not.toBeInTheDocument();
  });

  it("keeps Block inside the more-actions menu", async () => {
    mocks.getFighterProfile.mockResolvedValue(fighterProfile);
    const user = userEvent.setup();
    renderScreen(fighterProfile);

    expect(screen.queryByRole("button", { name: "Block Fighter" }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More fighter actions" }));
    expect(screen.getByRole("button", { name: "Block Fighter" }))
      .toBeInTheDocument();
  });
});

function renderScreen(initialFighter: FighterProfile) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FighterProfileScreen initialFighter={initialFighter} />
    </QueryClientProvider>,
  );
}

const fighterProfile: FighterProfile = {
  profile: {
    id: "00000000-0000-4000-8000-000000000002",
    username: "fighter_two",
    avatarUrl: null,
  },
  relationship: "incoming",
  requestedAt: new Date("2026-07-29T12:00:00Z"),
  connectedAt: null,
  stats: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
