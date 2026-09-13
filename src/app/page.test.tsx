import { beforeEach, describe, expect, it, vi } from "vitest";
import { contextBadgeUrls } from "@/components/shared/context-badges";

const mocks = vi.hoisted(() => ({
  getInitialNetworkData: vi.fn(),
  preload: vi.fn(),
  requireCurrentPageUser: vi.fn(),
}));

vi.mock("react-dom", () => ({ preload: mocks.preload }));
vi.mock("@/components/app/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/modules/graph/queries", () => ({
  getInitialNetworkData: mocks.getInitialNetworkData,
}));
vi.mock("@/modules/auth/page-user", () => ({
  requireCurrentPageUser: mocks.requireCurrentPageUser,
}));

import HomePage from "./page";

describe("HomePage resource hints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentPageUser.mockResolvedValue({ id: "test-user" });
    mocks.getInitialNetworkData.mockResolvedValue({
      graph: { nodes: [], edges: [] },
    });
  });

  it("does not preload unused context badges for an initial Library view", async () => {
    await HomePage({ searchParams: Promise.resolve({ view: "library" }) });

    expect(mocks.requireCurrentPageUser).toHaveBeenCalledWith("/?view=library");
    expect(mocks.getInitialNetworkData).not.toHaveBeenCalled();
    expect(mocks.preload).not.toHaveBeenCalled();
  });

  it.each([
    ["network", "/"],
    ["profile", "/?view=profile"],
  ] as const)("preloads context badges for the initial %s view", async (view, returnPath) => {
    await HomePage({ searchParams: Promise.resolve({ view }) });

    expect(mocks.requireCurrentPageUser).toHaveBeenCalledWith(returnPath);
    expect(mocks.preload.mock.calls).toEqual(
      contextBadgeUrls.map((href) => [href, { as: "image", type: "image/svg+xml" }]),
    );
  });
});
