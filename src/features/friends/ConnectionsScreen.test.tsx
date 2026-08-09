import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectionSection,
  ConnectionSectionItem,
  FighterConnection,
} from "@/data/connections";
import { ConnectionsScreen } from "./ConnectionsScreen";

const mocks = vi.hoisted(() => ({
  cancelOrUnfollow: vi.fn(),
  getConnectionSectionPage: vi.fn(),
  getConnectionsSummary: vi.fn(),
  requestFollow: vi.fn(),
  respondToFollowRequest: vi.fn(),
  searchFighter: vi.fn(),
  unblockFighter: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/data/connections", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/connections")>(),
  ...mocks,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));
vi.mock("./ProfileInviteSheet", () => ({ ProfileInviteSheet: () => null }));
vi.mock("./SharedDrillsSection", () => ({ SharedDrillsSection: () => null }));

describe("ConnectionsScreen", () => {
  let sectionItems: Record<ConnectionSection, ConnectionSectionItem[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    sectionItems = {
      followers: [],
      following: [],
      incoming: [],
      outgoing: [],
      blocked: [],
    };
    mocks.getConnectionsSummary.mockImplementation(async () => ({
      counts: {
        followers: sectionItems.followers.length,
        following: sectionItems.following.length,
        incoming: sectionItems.incoming.length,
        outgoing: sectionItems.outgoing.length,
        blocked: sectionItems.blocked.length,
      },
    }));
    mocks.getConnectionSectionPage.mockImplementation(async (section: ConnectionSection) => ({
      section,
      items: sectionItems[section],
      nextCursor: null,
    }));
    mocks.cancelOrUnfollow.mockResolvedValue(mutationResult("beta_fighter"));
  });

  it("keeps search input and result tied to the submitted username", async () => {
    const search = deferred<FighterConnection | null>();
    mocks.searchFighter.mockReturnValue(search.promise);
    const user = userEvent.setup();
    renderScreen("followers");

    const input = screen.getByLabelText("Exact username");
    await user.type(input, "fighter_two");
    await user.click(screen.getByRole("button", { name: "Search username" }));

    expect(input).toBeDisabled();
    search.resolve(connection("fighter_two"));
    expect(await screen.findByText("@fighter_two")).toBeInTheDocument();
    expect(input).toBeEnabled();

    await user.clear(input);
    expect(screen.queryByText("@fighter_two")).not.toBeInTheDocument();
  });

  it("serializes request mutations across received rows", async () => {
    const firstAction = deferred<ReturnType<typeof mutationResult>>();
    mocks.respondToFollowRequest.mockReturnValueOnce(firstAction.promise);
    sectionItems.incoming = [requestItem("alpha_fighter"), requestItem("beta_fighter")];
    const user = userEvent.setup();
    renderScreen("requests");

    const firstAccept = await screen.findByRole("button", { name: "Accept @alpha_fighter" });
    const secondAccept = screen.getByRole("button", { name: "Accept @beta_fighter" });
    await user.click(firstAccept);

    expect(firstAccept).toBeDisabled();
    expect(secondAccept).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating @alpha_fighter");

    firstAction.resolve(mutationResult("alpha_fighter", {
      incoming: "accepted",
    }));
    await waitFor(() => expect(secondAccept).toBeEnabled());
    expect(mocks.respondToFollowRequest).toHaveBeenCalledTimes(1);
  });

  it("lets the sender cancel a pending request", async () => {
    sectionItems.outgoing = [requestItem("beta_fighter")];
    mocks.cancelOrUnfollow.mockImplementationOnce(async (userId: string) => {
      sectionItems.outgoing = [];
      return mutationResultById(userId);
    });
    const user = userEvent.setup();
    renderScreen("requests");

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(mocks.cancelOrUnfollow).toHaveBeenCalledWith(profile("beta_fighter").id);
    await waitFor(() => expect(screen.queryByText("@beta_fighter")).not.toBeInTheDocument());
  });

  it("continues a paginated followers list without replacing its first page", async () => {
    mocks.getConnectionsSummary.mockResolvedValue({
      counts: { followers: 2, following: 0, incoming: 0, outgoing: 0, blocked: 0 },
    });
    mocks.getConnectionSectionPage.mockImplementation(
      async (section: ConnectionSection, cursor: string | null) => {
        if (section !== "followers") return { section, items: [], nextCursor: null };
        return cursor
          ? { section, items: [requestItem("beta_fighter")], nextCursor: null }
          : { section, items: [requestItem("alpha_fighter")], nextCursor: "next-page" };
      },
    );
    const user = userEvent.setup();
    renderScreen("followers");

    expect(await screen.findByText("@alpha_fighter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more followers" }));
    expect(await screen.findByText("@beta_fighter")).toBeInTheDocument();
    expect(screen.getByText("@alpha_fighter")).toBeInTheDocument();
  });
});

function renderScreen(initialTab: "followers" | "following" | "requests" | "blocked") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsScreen currentUsername="current_fighter" initialTab={initialTab} />
    </QueryClientProvider>,
  );
}

function profile(username: string) {
  return {
    id: username === "alpha_fighter"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000002",
    username,
    avatarUrl: null,
  };
}

function requestItem(username: string) {
  return { profile: profile(username), occurredAt: new Date("2026-07-29T12:00:00Z") };
}

function direction(status: "none" | "pending" | "accepted") {
  return {
    status,
    requestedAt: status === "none" ? null : new Date("2026-07-29T12:00:00Z"),
    acceptedAt: status === "accepted" ? new Date("2026-07-29T13:00:00Z") : null,
  };
}

function connection(username: string): FighterConnection {
  return {
    profile: profile(username),
    isSelf: false,
    blockedByViewer: false,
    outgoing: direction("none"),
    incoming: direction("none"),
    mutual: false,
  };
}

function mutationResult(
  username: string,
  states: { outgoing?: "none" | "pending" | "accepted"; incoming?: "none" | "pending" | "accepted" } = {},
) {
  return mutationResultById(profile(username).id, states);
}

function mutationResultById(
  userId: string,
  states: { outgoing?: "none" | "pending" | "accepted"; incoming?: "none" | "pending" | "accepted" } = {},
) {
  const outgoing = direction(states.outgoing ?? "none");
  const incoming = direction(states.incoming ?? "none");
  return {
    userId,
    blockedByViewer: false,
    outgoing,
    incoming,
    mutual: outgoing.status === "accepted" && incoming.status === "accepted",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}
