import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FighterProfile } from "@/data/connections";
import { FighterProfileScreen } from "./FighterProfileScreen";

const mocks = vi.hoisted(() => ({
  getFighterProfile: vi.fn(),
  respondToFollowRequest: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock("@/data/connections", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/connections")>(),
  blockFighter: vi.fn(),
  cancelOrUnfollow: vi.fn(),
  getFighterProfile: mocks.getFighterProfile,
  reportFighter: vi.fn(),
  requestFollow: vi.fn(),
  respondToFollowRequest: mocks.respondToFollowRequest,
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => <span>{profile.displayName.slice(0, 1)}</span>,
}));
vi.mock("./FighterActionConfirmationSheet", () => ({ FighterActionConfirmationSheet: () => null }));
vi.mock("./FighterReportSheet", () => ({ FighterReportSheet: () => null }));
vi.mock("./SharedDrillsSection", () => ({ SharedDrillsSection: () => null }));
vi.mock("./FighterMoreActionsSheet", () => ({
  FighterMoreActionsSheet: ({ open, onBlock }: { open: boolean; onBlock: () => void }) => (
    open ? <button type="button" onClick={onBlock}>Block Fighter</button> : null
  ),
}));

describe("FighterProfileScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading handoff when accepting creates reciprocal access", async () => {
    const profileRefresh = deferred<FighterProfile>();
    mocks.getFighterProfile.mockReturnValue(profileRefresh.promise);
    mocks.respondToFollowRequest.mockResolvedValue({
      userId: fighterProfile.profile.id,
      blockedByViewer: false,
      outgoing: direction("accepted"),
      incoming: direction("accepted"),
      mutual: true,
    });
    const user = userEvent.setup();
    renderScreen(fighterProfile);

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Loading private training totals…")).toBeInTheDocument();
    expect(screen.queryByText("Training totals appear after you both follow each other."))
      .not.toBeInTheDocument();

    profileRefresh.resolve({
      ...fighterProfile,
      incoming: direction("accepted"),
      mutual: true,
      canViewConnections: true,
      stats: { drillCount: 4, trainingMethods: [] },
    });
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
  });

  it("shows both Following and Follows you without a special mutual label", () => {
    mocks.getFighterProfile.mockResolvedValue(mutualProfile);
    renderScreen(mutualProfile);

    expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(screen.getByText("Follows you")).toBeInTheDocument();
    expect(screen.queryByText(/mutual/i)).not.toBeInTheDocument();
  });

  it("keeps Block inside the more-actions menu", async () => {
    mocks.getFighterProfile.mockResolvedValue(fighterProfile);
    const user = userEvent.setup();
    renderScreen(fighterProfile);

    expect(screen.queryByRole("button", { name: "Block Fighter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More fighter actions" }));
    expect(screen.getByRole("button", { name: "Block Fighter" })).toBeInTheDocument();
  });
});
function renderScreen(initialFighter: FighterProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FighterProfileScreen initialFighter={initialFighter} />
    </QueryClientProvider>,
  );
}

function direction(status: "none" | "pending" | "accepted") {
  return {
    status,
    requestedAt: status === "none" ? null : new Date("2026-07-29T12:00:00Z"),
    acceptedAt: status === "accepted" ? new Date("2026-07-29T13:00:00Z") : null,
  };
}

const fighterProfile: FighterProfile = {
  profile: {
    id: "00000000-0000-4000-8000-000000000002",
    username: "fighter_two",
    avatarUrl: null,
  },
  isSelf: false,
  blockedByViewer: false,
  outgoing: direction("accepted"),
  incoming: direction("pending"),
  mutual: false,
  socialCounts: { followers: 2, following: 3 },
  canViewConnections: false,
  stats: null,
};

const mutualProfile: FighterProfile = {
  ...fighterProfile,
  incoming: direction("accepted"),
  mutual: true,
  canViewConnections: true,
  stats: { drillCount: 4, trainingMethods: [] },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}
