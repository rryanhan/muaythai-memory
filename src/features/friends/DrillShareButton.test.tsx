import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrillShareButton } from "./DrillShareButton";

const mocks = vi.hoisted(() => ({
  getDrillShareFriendPage: vi.fn(),
  updateDrillShare: vi.fn(),
}));

vi.mock("@/data/sharing", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/sharing")>(),
  ...mocks,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));
vi.mock("@/features/media/use-drawer-focus", () => ({
  useDrawerFocus: () => ({ current: null }),
}));
vi.mock("vaul", async () => {
  const React = await import("react");
  const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  return {
    Drawer: {
      Content,
      Description: PassThrough,
      Handle: () => <div />,
      Overlay: () => <div />,
      Portal: PassThrough,
      Root: PassThrough,
      Title: PassThrough,
    },
  };
});

describe("DrillShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDrillShareFriendPage.mockResolvedValue({
      items: [{
        profile: {
          id: "00000000-0000-4000-8000-000000000002",
          username: "training_partner",
          avatarUrl: null,
        },
        shared: false,
      }],
      nextCursor: null,
    });
    mocks.updateDrillShare.mockResolvedValue({
      drillId: "00000000-0000-4000-8000-000000000001",
      recipientUserId: "00000000-0000-4000-8000-000000000002",
      shared: true,
    });
  });

  it("optimistically toggles a reciprocal connection and persists the share", async () => {
    const success = deferred<{
      drillId: string;
      recipientUserId: string;
      shared: boolean;
    }>();
    mocks.updateDrillShare.mockReturnValue(success.promise);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", {
      name: "Share drill with connections",
    }));
    const friend = await screen.findByRole("button", {
      name: "Share drill with @training_partner",
    });
    expect(friend).toHaveAttribute("aria-pressed", "false");

    await user.click(friend);

    expect(friend).toHaveAttribute("aria-pressed", "true");
    expect(mocks.updateDrillShare).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      {
        recipientUserId: "00000000-0000-4000-8000-000000000002",
        shared: true,
      },
    );
    mocks.getDrillShareFriendPage.mockResolvedValue({
      items: [{
        profile: {
          id: "00000000-0000-4000-8000-000000000002",
          username: "training_partner",
          avatarUrl: null,
        },
        shared: true,
      }],
      nextCursor: null,
    });
    success.resolve({
      drillId: "00000000-0000-4000-8000-000000000001",
      recipientUserId: "00000000-0000-4000-8000-000000000002",
      shared: true,
    });
    await waitFor(() => expect(friend).toBeEnabled());
  });

  it("rolls an optimistic share back when persistence fails", async () => {
    const failure = deferred<never>();
    mocks.updateDrillShare.mockReturnValue(failure.promise);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", {
      name: "Share drill with connections",
    }));
    const friend = await screen.findByRole("button", {
      name: "Share drill with @training_partner",
    });
    await user.click(friend);
    expect(friend).toHaveAttribute("aria-pressed", "true");

    failure.reject(new Error("Share failed."));

    await waitFor(() => {
      expect(friend).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("alert")).toHaveTextContent("Share failed.");
    });
  });
});

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DrillShareButton drillId="00000000-0000-4000-8000-000000000001" />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
