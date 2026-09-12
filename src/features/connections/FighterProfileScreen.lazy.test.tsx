import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, expect, it, vi } from "vitest";
import type { FighterProfile } from "@/data/connections";
import { FighterProfileScreen } from "./FighterProfileScreen";

const mocks = vi.hoisted(() => ({
  actionConfirmationSheetLoaded: vi.fn(),
  getFighterProfile: vi.fn(),
  moreActionsSheetLoaded: vi.fn(),
  reportSheetLoaded: vi.fn(),
  routerReplace: vi.fn(),
}));

const sheetModules = vi.hoisted(() => {
  let resolveConfirmation!: () => void;
  let resolveMoreActions!: () => void;
  let resolveReport!: () => void;
  const confirmationGate = new Promise<void>((resolve) => {
    resolveConfirmation = resolve;
  });
  const moreActionsGate = new Promise<void>((resolve) => {
    resolveMoreActions = resolve;
  });
  const reportGate = new Promise<void>((resolve) => {
    resolveReport = resolve;
  });

  return {
    confirmationGate,
    moreActionsGate,
    reportGate,
    resolveConfirmation,
    resolveMoreActions,
    resolveReport,
  };
});

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
  respondToFollowRequest: vi.fn(),
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/profile/ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { displayName: string } }) => (
    <span>{profile.displayName.slice(0, 1)}</span>
  ),
}));
vi.mock("./SharedDrillsSection", () => ({ SharedDrillsSection: () => null }));
vi.mock("./FighterActionConfirmationSheet", async () => {
  mocks.actionConfirmationSheetLoaded();
  await sheetModules.confirmationGate;
  return {
    FighterActionConfirmationSheet: ({
      action,
      open,
      onClose,
    }: {
      action: "unfollow" | "block";
      open: boolean;
      onClose: () => void;
    }) => (
      <div data-testid="fighter-confirmation-sheet" data-action={action} data-open={open}>
        {open && <button type="button" onClick={onClose}>Cancel confirmation</button>}
      </div>
    ),
  };
});
vi.mock("./FighterMoreActionsSheet", async () => {
  mocks.moreActionsSheetLoaded();
  await sheetModules.moreActionsGate;
  return {
    FighterMoreActionsSheet: ({
      open,
      onClose,
      onReport,
      onBlock,
    }: {
      open: boolean;
      onClose: () => void;
      onReport: () => void;
      onBlock: () => void;
    }) => (
      <div data-testid="fighter-more-actions-sheet" data-open={open}>
        {open && (
          <>
            <button type="button" onClick={onClose}>Close actions</button>
            <button type="button" onClick={onReport}>Report Fighter</button>
            <button type="button" onClick={onBlock}>Block Fighter</button>
          </>
        )}
      </div>
    ),
  };
});
vi.mock("./FighterReportSheet", async () => {
  mocks.reportSheetLoaded();
  await sheetModules.reportGate;
  return {
    FighterReportSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
      <div data-testid="fighter-report-sheet" data-open={open}>
        {open && <button type="button" onClick={onClose}>Close report</button>}
      </div>
    ),
  };
});

afterAll(() => {
  sheetModules.resolveConfirmation();
  sheetModules.resolveMoreActions();
  sheetModules.resolveReport();
});

it("loads each fighter sheet on demand once and preserves cold fallback behavior", async () => {
  mocks.getFighterProfile.mockResolvedValue(fighterProfile);
  const user = userEvent.setup();
  renderScreen();

  expect(mocks.actionConfirmationSheetLoaded).not.toHaveBeenCalled();
  expect(mocks.moreActionsSheetLoaded).not.toHaveBeenCalled();
  expect(mocks.reportSheetLoaded).not.toHaveBeenCalled();
  expect(screen.queryByTestId("fighter-confirmation-sheet")).not.toBeInTheDocument();
  expect(screen.queryByTestId("fighter-more-actions-sheet")).not.toBeInTheDocument();
  expect(screen.queryByTestId("fighter-report-sheet")).not.toBeInTheDocument();

  const followingButton = screen.getByRole("button", { name: "Following" });
  await user.click(followingButton);
  const confirmationLoading = await expectLoadingFallback("Unfollow?", "Loading confirmation…");
  expect(mocks.actionConfirmationSheetLoaded).toHaveBeenCalledOnce();
  expect(mocks.moreActionsSheetLoaded).not.toHaveBeenCalled();
  expect(mocks.reportSheetLoaded).not.toHaveBeenCalled();
  expect(screen.queryByTestId("fighter-confirmation-sheet")).not.toBeInTheDocument();

  fireEvent.keyDown(confirmationLoading.dialog, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Unfollow?" })).not.toBeInTheDocument();
    expect(followingButton).toHaveFocus();
  });

  await user.click(followingButton);
  await act(async () => {
    sheetModules.resolveConfirmation();
    await sheetModules.confirmationGate;
  });
  const confirmationSheet = await screen.findByTestId("fighter-confirmation-sheet");
  expect(confirmationSheet).toHaveAttribute("data-action", "unfollow");
  expect(confirmationSheet).toHaveAttribute("data-open", "true");
  await user.click(screen.getByRole("button", { name: "Cancel confirmation" }));
  expect(confirmationSheet).toHaveAttribute("data-open", "false");
  await user.click(followingButton);
  expect(confirmationSheet).toHaveAttribute("data-open", "true");
  expect(mocks.actionConfirmationSheetLoaded).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Cancel confirmation" }));

  const moreButton = screen.getByRole("button", { name: "More fighter actions" });
  await user.click(moreButton);
  const moreLoading = await expectLoadingFallback("@fighter_two", "Loading fighter actions…");
  expect(mocks.moreActionsSheetLoaded).toHaveBeenCalledOnce();
  expect(mocks.reportSheetLoaded).not.toHaveBeenCalled();
  expect(screen.queryByTestId("fighter-more-actions-sheet")).not.toBeInTheDocument();

  await user.click(moreLoading.cancel);
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "@fighter_two" })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });

  await user.click(moreButton);
  await act(async () => {
    sheetModules.resolveMoreActions();
    await sheetModules.moreActionsGate;
  });
  const moreActionsSheet = await screen.findByTestId("fighter-more-actions-sheet");
  expect(moreActionsSheet).toHaveAttribute("data-open", "true");
  await user.click(screen.getByRole("button", { name: "Close actions" }));
  expect(moreActionsSheet).toHaveAttribute("data-open", "false");
  await user.click(moreButton);
  expect(moreActionsSheet).toHaveAttribute("data-open", "true");
  expect(mocks.moreActionsSheetLoaded).toHaveBeenCalledOnce();

  await user.click(screen.getByRole("button", { name: "Report Fighter" }));
  expect(moreActionsSheet).toHaveAttribute("data-open", "false");
  const reportLoading = await expectLoadingFallback("Report Fighter", "Loading report form…");
  expect(mocks.reportSheetLoaded).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("fighter-report-sheet")).not.toBeInTheDocument();

  fireEvent.keyDown(reportLoading.dialog, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Report Fighter" })).not.toBeInTheDocument();
  });

  await user.click(moreButton);
  await user.click(screen.getByRole("button", { name: "Report Fighter" }));
  await act(async () => {
    sheetModules.resolveReport();
    await sheetModules.reportGate;
  });
  const reportSheet = await screen.findByTestId("fighter-report-sheet");
  expect(reportSheet).toHaveAttribute("data-open", "true");
  await user.click(screen.getByRole("button", { name: "Close report" }));
  expect(reportSheet).toHaveAttribute("data-open", "false");

  await user.click(moreButton);
  await user.click(screen.getByRole("button", { name: "Report Fighter" }));
  expect(await screen.findByTestId("fighter-report-sheet")).toHaveAttribute("data-open", "true");
  expect(mocks.reportSheetLoaded).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Close report" }));

  await user.click(moreButton);
  await user.click(screen.getByRole("button", { name: "Block Fighter" }));
  expect(moreActionsSheet).toHaveAttribute("data-open", "false");
  expect(confirmationSheet).toHaveAttribute("data-action", "block");
  expect(confirmationSheet).toHaveAttribute("data-open", "true");
  expect(mocks.actionConfirmationSheetLoaded).toHaveBeenCalledOnce();
  expect(mocks.moreActionsSheetLoaded).toHaveBeenCalledOnce();
  expect(mocks.reportSheetLoaded).toHaveBeenCalledOnce();
});

async function expectLoadingFallback(title: string, message: string) {
  const dialog = await screen.findByRole("dialog", { name: title });
  expect(screen.getByRole("main")).not.toContainElement(dialog);
  expect(dialog.parentElement).toBe(document.body);
  expect(within(dialog).getByRole("status")).toHaveTextContent(message);
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  await waitFor(() => expect(cancel).toHaveFocus());
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(cancel).toHaveFocus();
  return { cancel, dialog };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FighterProfileScreen initialFighter={fighterProfile} />
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
