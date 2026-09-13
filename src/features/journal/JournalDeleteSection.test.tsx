import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalDeleteSection } from "./JournalDeleteSection";

const mocks = vi.hoisted(() => ({
  deleteJournalEntry: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/data/journal", () => ({
  deleteJournalEntry: mocks.deleteJournalEntry,
}));

describe("JournalDeleteSection mutation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits once for same-tick confirmations and navigates after success", async () => {
    const deletion = deferred<string>();
    mocks.deleteJournalEntry.mockReturnValueOnce(deletion.promise);
    renderDelete();

    fireEvent.click(screen.getByRole("button", { name: "Delete Entry" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this entry?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete Entry" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    act(() => {
      confirm.click();
      cancel.click();
      confirm.click();
    });

    expect(dialog).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await waitFor(() => expect(mocks.deleteJournalEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      deletion.resolve(entryId);
      await deletion.promise;
    });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/?view=profile"));
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("unlocks the confirmation after a recoverable error", async () => {
    const deletion = deferred<string>();
    mocks.deleteJournalEntry
      .mockReturnValueOnce(deletion.promise)
      .mockResolvedValueOnce(entryId);
    renderDelete();

    fireEvent.click(screen.getByRole("button", { name: "Delete Entry" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Entry" }));

    await act(async () => {
      deletion.reject(new Error("Delete service unavailable."));
      await Promise.resolve();
    });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Delete service unavailable.",
    );
    expect(within(dialog).getByRole("button", { name: "Delete Entry" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Entry" }));
    await waitFor(() => expect(mocks.deleteJournalEntry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/?view=profile"));
  });

  it("does not navigate when deletion settles after unmount", async () => {
    const deletion = deferred<string>();
    mocks.deleteJournalEntry.mockReturnValueOnce(deletion.promise);
    const { queryClient, unmount } = renderDelete();

    fireEvent.click(screen.getByRole("button", { name: "Delete Entry" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Entry" }));

    unmount();
    await act(async () => {
      deletion.resolve(entryId);
      await deletion.promise;
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

const entryId = "00000000-0000-4000-8000-000000000801";

function renderDelete() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <JournalDeleteSection entryId={entryId} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
