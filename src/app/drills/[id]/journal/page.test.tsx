import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  entryPrefetchValues: [] as unknown[],
  getOwnedDrillHeader: vi.fn(),
  listJournalEntries: vi.fn(),
  requireCurrentPageUserId: vi.fn(),
}));

vi.mock("next/link", async () => {
  const React = await import("react");

  return {
    default: ({
      children,
      href,
      prefetch,
      ...props
    }: {
      children: ReactNode;
      href: string;
      prefetch?: boolean | null;
      [key: string]: unknown;
    }) => {
      if (href.startsWith("/journal/")) mocks.entryPrefetchValues.push(prefetch);
      return React.createElement("a", { ...props, href }, children);
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/modules/auth/page-user", () => ({
  requireCurrentPageUserId: mocks.requireCurrentPageUserId,
}));
vi.mock("@/modules/drills/queries", () => ({
  getOwnedDrillHeader: mocks.getOwnedDrillHeader,
}));
vi.mock("@/modules/journal/queries", () => ({
  listJournalEntries: mocks.listJournalEntries,
}));

import DrillJournalPage from "./page";

const drillId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

describe("DrillJournalPage link prefetching", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.entryPrefetchValues.length = 0;
    mocks.requireCurrentPageUserId.mockResolvedValue(userId);
    mocks.getOwnedDrillHeader.mockResolvedValue({ id: drillId, title: "Rear kick" });
    mocks.listJournalEntries.mockResolvedValue({
      entries: Array.from({ length: 25 }, (_, index) => ({
        id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        caption: `Round ${index + 1}`,
        occurredOn: "2026-09-11",
      })),
      nextCursor: null,
    });
  });

  it("leaves dynamic entry links on Next's bounded default prefetch behavior", async () => {
    render(await DrillJournalPage({
      params: Promise.resolve({ id: drillId }),
      searchParams: Promise.resolve({}),
    }));

    const entryLinks = screen.getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/journal/"));
    expect(entryLinks).toHaveLength(25);
    expect(mocks.entryPrefetchValues).toHaveLength(25);
    expect(mocks.entryPrefetchValues).toEqual(Array(25).fill(undefined));
  });
});
