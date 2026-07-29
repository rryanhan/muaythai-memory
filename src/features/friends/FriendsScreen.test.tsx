import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FighterConnection,
  FriendSection,
  FriendSectionItem,
} from "@/data/friends";
import { FriendsScreen } from "./FriendsScreen";

const mocks = vi.hoisted(() => ({
  cancelFriendRequest: vi.fn(),
  getFriendSectionPage: vi.fn(),
  getFriendsSummary: vi.fn(),
  respondToFriendRequest: vi.fn(),
  searchFighter: vi.fn(),
  sendFriendRequest: vi.fn(),
  unblockFighter: vi.fn(),
}));

vi.mock("@/data/friends", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/friends")>(),
  ...mocks,
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));

describe("FriendsScreen", () => {
  let sectionItems: Record<FriendSection, FriendSectionItem[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    sectionItems = {
      friends: [],
      incoming: [],
      outgoing: [],
      blocked: [],
    };
    mocks.getFriendsSummary.mockImplementation(async () => ({
      counts: {
        friends: sectionItems.friends.length,
        incoming: sectionItems.incoming.length,
        outgoing: sectionItems.outgoing.length,
        blocked: sectionItems.blocked.length,
      },
    }));
    mocks.getFriendSectionPage.mockImplementation(async (section: FriendSection) => ({
      section,
      items: sectionItems[section],
      nextCursor: null,
    }));
    mocks.cancelFriendRequest.mockResolvedValue({
      userId: profile("beta_fighter").id,
      relationship: "none",
    });
  });

  it("keeps the search input and result tied to the submitted username", async () => {
    const search = deferred<FighterConnection | null>();
    mocks.searchFighter.mockReturnValue(search.promise);
    const user = userEvent.setup();
    renderScreen();

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

  it("serializes friend mutations so a second profile cannot race the first", async () => {
    const firstAction = deferred<{ userId: string; relationship: "friends" }>();
    mocks.respondToFriendRequest.mockReturnValueOnce(firstAction.promise);
    sectionItems.incoming = [
      requestItem("alpha_fighter"),
      requestItem("beta_fighter"),
    ];
    const user = userEvent.setup();
    renderScreen();

    const firstAccept = await screen.findByRole("button", {
      name: "Accept @alpha_fighter",
    });
    const secondAccept = screen.getByRole("button", {
      name: "Accept @beta_fighter",
    });

    await user.click(firstAccept);
    expect(firstAccept).toBeDisabled();
    expect(secondAccept).toBeDisabled();
    expect(screen.getByRole("status", {
      name: "",
    })).toHaveTextContent("Updating @alpha_fighter");

    firstAction.resolve({
      userId: profile("alpha_fighter").id,
      relationship: "friends",
    });
    await waitFor(() => expect(secondAccept).toBeEnabled());
    expect(mocks.respondToFriendRequest).toHaveBeenCalledTimes(1);
  });

  it("lets the sender cancel a pending request", async () => {
    sectionItems.outgoing = [requestItem("beta_fighter")];
    mocks.cancelFriendRequest.mockImplementationOnce(async (userId: string) => {
      sectionItems.outgoing = [];
      return { userId, relationship: "none" };
    });
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(mocks.cancelFriendRequest).toHaveBeenCalledWith(
      profile("beta_fighter").id,
    );
    await waitFor(() => {
      expect(screen.queryByText("@beta_fighter")).not.toBeInTheDocument();
    });
  });

  it("continues a paginated friend list without replacing the first page", async () => {
    mocks.getFriendsSummary.mockResolvedValue({
      counts: { friends: 2, incoming: 0, outgoing: 0, blocked: 0 },
    });
    mocks.getFriendSectionPage.mockImplementation(
      async (section: FriendSection, cursor: string | null) => {
        if (section !== "friends") return { section, items: [], nextCursor: null };
        return cursor
          ? {
              section,
              items: [requestItem("beta_fighter")],
              nextCursor: null,
            }
          : {
              section,
              items: [requestItem("alpha_fighter")],
              nextCursor: "next-page",
            };
      },
    );
    const user = userEvent.setup();
    renderScreen();

    expect(await screen.findByText("@alpha_fighter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more friends" }));

    expect(await screen.findByText("@beta_fighter")).toBeInTheDocument();
    expect(screen.getByText("@alpha_fighter")).toBeInTheDocument();
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendsScreen currentUsername="current_fighter" />
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
  return {
    profile: profile(username),
    occurredAt: new Date("2026-07-29T12:00:00Z"),
  };
}

function connection(username: string): FighterConnection {
  return {
    profile: profile(username),
    relationship: "none",
    requestedAt: null,
    connectedAt: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
