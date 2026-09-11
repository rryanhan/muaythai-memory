import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedDrillListResponse } from "@/data/sharing";
import { SharedDrillsSection } from "./SharedDrillsSection";

const mocks = vi.hoisted(() => ({
  getSharedDrills: vi.fn(),
  linkProps: vi.fn(),
}));

vi.mock("@/data/sharing", () => ({
  getSharedDrills: mocks.getSharedDrills,
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => {
    mocks.linkProps(prefetch === undefined ? props : { ...props, prefetch });
    return <a {...props}>{children}</a>;
  },
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));

describe("SharedDrillsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSharedDrills.mockResolvedValue(sharedDrills);
  });

  it("links shared-drill rows without forcing full-route prefetches", async () => {
    renderSection();

    const href = `/shared/drills/${sharedDrills.items[0].drill.id}`;
    expect(await screen.findByRole("link", { name: /teep reset/i })).toHaveAttribute("href", href);
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

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SharedDrillsSection />
    </QueryClientProvider>,
  );
}

const sharedDrills: SharedDrillListResponse = {
  items: [{
    drill: {
      id: "00000000-0000-4000-8000-000000000301",
      title: "Teep reset",
      summary: "Reset and frame after the lead teep.",
      trainingMethods: [],
      tags: [],
      customTags: [],
      statusTags: [],
      createdAt: new Date("2026-09-01T12:00:00Z"),
      updatedAt: new Date("2026-09-01T12:00:00Z"),
    },
    owner: {
      id: "00000000-0000-4000-8000-000000000302",
      username: "alpha_fighter",
      avatarUrl: null,
    },
    sharedAt: new Date("2026-09-10T12:00:00Z"),
  }],
  nextCursor: null,
};
