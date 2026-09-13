import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntryDetail } from "@/data/types";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  updateJournalEntry: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => null,
}));

vi.mock("@/data/drills", () => ({
  getDrills: dataMocks.getDrills,
}));

vi.mock("@/data/journal", () => ({
  updateJournalEntry: dataMocks.updateJournalEntry,
}));

vi.mock("./JournalDatePicker", () => ({
  JournalDatePicker: () => null,
}));

vi.mock("./JournalDrillPicker", () => ({
  JournalDrillPicker: () => null,
}));

vi.mock("./JournalVideoPlayer", () => ({
  JournalVideoPlayer: () => null,
}));

vi.mock("./JournalDiscardSheet", () => ({
  JournalDiscardSheet: ({
    discardLabel,
    onDiscard,
    onStay,
    open,
    pending,
    title,
  }: {
    discardLabel: string;
    onDiscard: () => void;
    onStay: () => void;
    open: boolean;
    pending: boolean;
    title: string;
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" disabled={pending} onClick={onStay}>Keep editing</button>
      <button type="button" disabled={pending} onClick={onDiscard}>{discardLabel}</button>
    </div>
  ) : null,
}));

import { JournalEditScreen } from "./JournalEditScreen";

describe("JournalEditScreen navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.push.mockImplementation((destination: string) => {
      window.history.pushState({}, "", destination);
    });
    navigationMocks.replace.mockImplementation((destination: string) => {
      window.history.replaceState({}, "", destination);
    });
    dataMocks.getDrills.mockResolvedValue({ drills: [] });
    dataMocks.updateJournalEntry.mockResolvedValue({
      ...entry,
      caption: "Updated caption",
    });
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({}, "", `/journal/${entry.id}/edit`);
  });

  it("keeps dirty edits on Back and only leaves after discard confirmation", async () => {
    const user = userEvent.setup();
    renderScreen();

    const caption = screen.getByRole("textbox", { name: /caption/i });
    await user.type(caption, " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    expect(caption).toHaveValue("Original caption changed");
    expect(navigationMocks.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("does not let browser Forward bypass a history prompt", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: /caption/i }), " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    act(() => window.history.forward());

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    expect(window.history.state?.__journalEditGuard).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
  });

  it("restores the editor after a jump to an older identical edit URL", async () => {
    const user = userEvent.setup();
    const editPath = `/journal/${entry.id}/edit`;
    window.history.replaceState({ entry: "oldest" }, "", editPath);
    window.history.pushState({ entry: "middle" }, "", "/history/middle");
    window.history.pushState({}, "", editPath);
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: /caption/i }), " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());

    act(() => window.history.go(-2));
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(editPath);
    expect(window.history.state?.__journalEditGuard).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(window.history.state?.entry).toBe("oldest"));
  });

  it("collapses the guard before confirmed Cancel navigation", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: /caption/i }), " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(navigationMocks.push).toHaveBeenCalledWith(`/journal/${entry.id}`));
    expect(navigationMocks.push).toHaveBeenCalledOnce();
    expect(window.history.state?.__journalEditGuard).toBeUndefined();
  });

  it("removes the guard before successful Save navigation", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: /caption/i }), " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith(`/journal/${entry.id}`));
    expect(dataMocks.updateJournalEntry).toHaveBeenCalledWith(entry.id, {
      occurredOn: entry.occurredOn,
      caption: "Original caption changed",
      drillId: null,
    });
    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(navigationMocks.replace).toHaveBeenCalledOnce();
    expect(navigationMocks.refresh).toHaveBeenCalledOnce();
    expect(window.history.state?.__journalEditGuard).toBeUndefined();

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
  });

  it("replaces the marked editor when Save finishes from the Back prompt", async () => {
    const user = userEvent.setup();
    const update = deferred<JournalEntryDetail>();
    dataMocks.updateJournalEntry.mockReturnValue(update.promise);
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: /caption/i }), " changed");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    act(() => window.history.back());

    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();

    act(() => update.resolve({ ...entry, caption: "Original caption changed" }));
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith(`/journal/${entry.id}`));
    expect(window.location.pathname).toBe(`/journal/${entry.id}`);
    expect(window.history.state?.__journalEditGuard).toBeUndefined();

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
    act(() => window.history.forward());
    await waitFor(() => expect(window.location.pathname).toBe(`/journal/${entry.id}`));
    expect(window.history.state?.__journalEditGuard).toBeUndefined();
  });

  it("re-arms the guard after edits return to clean and become dirty again", async () => {
    const user = userEvent.setup();
    renderScreen();

    const caption = screen.getByRole("textbox", { name: /caption/i });
    await user.type(caption, " changed");
    const firstGuardKey = await waitFor(() => {
      expect(window.history.state?.__journalEditGuard).toBeTruthy();
      return window.history.state.__journalEditGuard;
    });

    await user.clear(caption);
    await user.type(caption, "Original caption");
    await waitFor(() => expect(window.history.state?.__journalEditGuard).toBeUndefined());

    await user.type(caption, " again");
    await waitFor(() => {
      expect(window.history.state?.__journalEditGuard).toBeTruthy();
      expect(window.history.state.__journalEditGuard).not.toBe(firstGuardKey);
    });

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal changes?" })).toBeInTheDocument();
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <JournalEditScreen entry={entry} returnDrillId={null} />
    </QueryClientProvider>,
  );
}

const entry: JournalEntryDetail = {
  id: "00000000-0000-4000-8000-000000000101",
  occurredOn: "2026-09-10",
  caption: "Original caption",
  drill: null,
  durationMs: 12_000,
  mimeType: "video/mp4",
  posterUrl: null,
  playbackUrl: "https://example.com/journal-entry.mp4",
  createdAt: new Date("2026-09-10T12:00:00Z"),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
