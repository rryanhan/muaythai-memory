import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedConnectionPageResponse } from "@/data/connections";
import { FighterConnectionsScreen } from "./FighterConnectionsScreen";

const mocks = vi.hoisted(() => ({
  getAuthorizedConnectionPage: vi.fn(),
  linkProps: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/data/connections", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/connections")>(),
  getAuthorizedConnectionPage: mocks.getAuthorizedConnectionPage,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => {
    mocks.linkProps(prefetch === undefined ? props : { ...props, prefetch });
    return <a {...props}>{children}</a>;
  },
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));

describe("FighterConnectionsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedConnectionPage.mockResolvedValue(initialPage);
  });

  it("links fighter rows without forcing full-route prefetches", async () => {
    renderScreen();

    const href = "/fighters/alpha_fighter";
    expect(await screen.findByRole("link", { name: /@alpha_fighter/ })).toHaveAttribute("href", href);
    const props = mocks.linkProps.mock.calls
      .map(([value]) => value)
      .find((value) => value.href === href);
    expect(props).toBeDefined();
    expect(props).not.toHaveProperty("prefetch");
    expect(props).not.toHaveProperty("onFocus");
    expect(props).not.toHaveProperty("onPointerEnter");
    expect(props).not.toHaveProperty("onTouchStart");
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FighterConnectionsScreen initialPage={initialPage} />
    </QueryClientProvider>,
  );
}

const initialPage: AuthorizedConnectionPageResponse = {
  owner: {
    id: "00000000-0000-4000-8000-000000000401",
    username: "current_fighter",
    avatarUrl: null,
  },
  section: "followers",
  items: [{
    profile: {
      id: "00000000-0000-4000-8000-000000000402",
      username: "alpha_fighter",
      avatarUrl: null,
    },
    occurredAt: new Date("2026-09-10T12:00:00Z"),
  }],
  nextCursor: null,
};
