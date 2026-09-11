import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillSummary } from "@/data";
import { LibraryDrillRow } from "./LibraryDrillList";

const mocks = vi.hoisted(() => ({
  linkProps: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => {
    mocks.linkProps(prefetch === undefined ? props : { ...props, prefetch });
    return <a {...props}>{children}</a>;
  },
}));

describe("LibraryDrillRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links to the drill while leaving prefetching on Next's automatic policy", () => {
    render(<LibraryDrillRow drill={drill} />);

    expect(screen.getByRole("link", { name: /teep reset/i })).toHaveAttribute(
      "href",
      `/drills/${drill.id}`,
    );
    const props = mocks.linkProps.mock.calls[0]?.[0];
    expect(props).not.toHaveProperty("prefetch");
    expect(props).not.toHaveProperty("onFocus");
    expect(props).not.toHaveProperty("onPointerEnter");
    expect(props).not.toHaveProperty("onTouchStart");
  });
});

const drill: DrillSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  title: "Teep reset",
  summary: "Reset and frame after the lead teep.",
  trainingMethods: [],
  tags: [],
  customTags: [],
  statusTags: [],
  createdAt: new Date("2026-09-01T12:00:00Z"),
  updatedAt: new Date("2026-09-01T12:00:00Z"),
};
