import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discardWork: vi.fn(),
  getDrills: vi.fn(),
  push: vi.fn(),
  upload: {
    busy: false,
    cancelUpload: vi.fn(),
    clearCompleted: vi.fn(),
    completedEntryId: null,
    discardWork: vi.fn(),
    draft: {
      caption: "Draft notes",
      drillId: "",
      durationMs: null,
      file: null,
      occurredOn: "2026-09-13",
      posterPreviewUrl: null,
      posterStatus: "empty",
      posterTimeSeconds: null,
      previewUrl: null,
    },
    error: null,
    hasWork: true,
    phase: "idle",
    progress: 0,
    setCaption: vi.fn(),
    setDrillId: vi.fn(),
    setDurationMs: vi.fn(),
    setFile: vi.fn(),
    setPosterImage: vi.fn(),
    setPreparedPoster: vi.fn(),
    startUpload: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: ({ onNavigate }: { onNavigate: (destination: string) => void }) => (
    <button type="button" onClick={() => onNavigate("/")}>Network</button>
  ),
}));

vi.mock("@/data/drills", () => ({
  getDrills: mocks.getDrills,
}));

vi.mock("./JournalUploadProvider", () => ({
  useJournalUpload: () => mocks.upload,
}));

vi.mock("./JournalDatePicker", () => ({
  JournalDatePicker: () => null,
}));

vi.mock("./JournalCoverEditor", () => ({
  JournalCoverEditor: () => null,
}));

vi.mock("./JournalDrillPicker", () => ({
  JournalDrillPicker: ({ onCreateDrill }: { onCreateDrill: () => void }) => (
    <button type="button" onClick={onCreateDrill}>Create related drill</button>
  ),
}));

vi.mock("./JournalVideoPlayer", () => ({
  JournalVideoPlayer: () => null,
}));

vi.mock("./JournalDiscardSheet", () => ({
  JournalDiscardSheet: ({
    error,
    onDiscard,
    onStay,
    open,
    pending,
  }: {
    error?: string | null;
    onDiscard: () => void;
    onStay: () => void;
    open: boolean;
    pending: boolean;
  }) => open ? (
    <div role="dialog" aria-label="Discard journal entry confirmation">
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={pending} onClick={onStay}>Keep editing</button>
      <button type="button" disabled={pending} onClick={onDiscard}>Discard entry</button>
    </div>
  ) : null,
}));

import { JournalUploadScreen } from "./JournalUploadScreen";

describe("JournalUploadScreen navigation guard", () => {
  let navigationIndex = 100;
  let furthestNavigationIndex = 100;
  let commitTraversal: (delta: number) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    navigationIndex = 100;
    furthestNavigationIndex = 100;
    commitTraversal = installNavigationIndexTracking(
      () => navigationIndex,
      (nextIndex) => {
        navigationIndex = nextIndex;
        furthestNavigationIndex = Math.max(furthestNavigationIndex, nextIndex);
      },
      () => furthestNavigationIndex,
    );
    mocks.discardWork.mockResolvedValue(undefined);
    mocks.upload.discardWork = mocks.discardWork;
    mocks.upload.hasWork = true;
    mocks.upload.phase = "idle";
    mocks.getDrills.mockResolvedValue({ drills: [] });
    mocks.push.mockImplementation((destination: string) => {
      window.history.pushState({}, "", destination);
    });
    window.history.replaceState({ entry: "journal-form" }, "", "/journal/new");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores Back before downstream routing and re-arms after Stay", async () => {
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    const downstreamPopState = vi.fn();
    window.addEventListener("popstate", downstreamPopState);
    act(() => window.history.back());

    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/journal/new");
      expect(window.history.state?.__journalGuard).toBeTruthy();
      expect(screen.getByRole("button", { name: "Keep editing" })).toBeEnabled();
    });
    expect(downstreamPopState).not.toHaveBeenCalled();
    window.removeEventListener("popstate", downstreamPopState);

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.history.state?.__journalGuard).toBeTruthy();

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));

    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
    expect(window.history.state).toEqual({ entry: "previous" });
    expect(mocks.discardWork).toHaveBeenCalledOnce();
  });

  it("preserves the first Forward target and the later forward stack while the prompt is open", async () => {
    const forwardState = {
      entry: "forward-target",
      __NA: true,
      tree: ["", { children: ["forward-target", {}] }],
    };
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    window.history.pushState(forwardState, "", "/journal/forward-target");
    window.history.pushState({ entry: "later-forward" }, "", "/journal/later-forward");
    act(() => window.history.go(-2));
    await waitFor(() => expect(window.location.pathname).toBe("/journal/new"));

    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());
    act(() => window.history.forward());

    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/journal/new");
      expect(window.history.state?.__journalGuard).toBeTruthy();
      expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled();
    });

    const callsBeforeLaterForward = vi.mocked(window.history.go).mock.calls.length;
    act(() => window.history.go(2));
    await waitFor(() => {
      expect(vi.mocked(window.history.go).mock.calls.slice(callsBeforeLaterForward))
        .toEqual([[2]]);
      expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled();
    });
    expect(screen.getByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    expect(window.location.pathname).toBe("/journal/new");

    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));
    await waitFor(() => expect(window.location.pathname).toBe("/journal/forward-target"));
    expect(window.history.state).toEqual(forwardState);
  });

  it("keeps Back and Forward directions intact after staying on a Forward prompt", async () => {
    const forwardState = { entry: "forward-target" };
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    window.history.pushState(forwardState, "", "/journal/forward-target");
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/journal/new"));

    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());
    act(() => window.history.forward());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep editing" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    const callsBeforeBack = vi.mocked(window.history.go).mock.calls.length;
    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep editing" })).toBeEnabled());
    expect(vi.mocked(window.history.go).mock.calls.slice(callsBeforeBack))
      .toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    const callsBeforeForward = vi.mocked(window.history.go).mock.calls.length;
    act(() => window.history.forward());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled());
    expect(vi.mocked(window.history.go).mock.calls.slice(callsBeforeForward))
      .toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));

    await waitFor(() => expect(window.location.pathname).toBe("/journal/forward-target"));
    expect(window.history.state).toEqual(forwardState);
  });

  it("restores after a multi-entry jump and discards to the exact attempted state", async () => {
    const targetState = {
      entry: "exact-target",
      __NA: true,
      tree: ["", { children: ["exact-target", {}] }],
    };
    window.history.replaceState(targetState, "", "/journal/exact-target");
    window.history.pushState({ entry: "middle" }, "", "/journal/middle");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.go(-2));
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/journal/new");
      expect(window.history.state?.__journalGuard).toBeTruthy();
      expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));
    await waitFor(() => expect(window.location.pathname).toBe("/journal/exact-target"));
    expect(window.history.state).toEqual(targetState);
  });

  it("keeps an exact Back target with the documented no-index fallback", async () => {
    vi.stubGlobal("navigation", undefined);
    window.history.replaceState({ entry: "fallback-target" }, "", "/journal/fallback-target");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    expect(window.location.pathname).toBe("/journal/new");
    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));

    await waitFor(() => expect(window.location.pathname).toBe("/journal/fallback-target"));
    expect(window.history.state).toEqual({ entry: "fallback-target" });
  });

  it("ignores a deferred discard after unmount and removes the guard marker", async () => {
    const discard = deferred<void>();
    mocks.discardWork.mockReturnValue(discard.promise);
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    const { unmount } = renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled());
    const discardButton = screen.getByRole("button", { name: "Discard entry" });
    act(() => {
      discardButton.click();
      discardButton.click();
    });
    expect(mocks.discardWork).toHaveBeenCalledOnce();
    const historyCallsBeforeUnmount = vi.mocked(window.history.go).mock.calls.length;
    const removeNavigationListener = vi.spyOn(window.navigation, "removeEventListener");

    unmount();
    expect(window.history.state?.__journalGuard).toBeUndefined();
    expect(removeNavigationListener).toHaveBeenCalledWith("navigate", expect.any(Function));
    await act(async () => {
      discard.resolve();
      await discard.promise;
    });

    expect(window.location.pathname).toBe("/journal/new");
    expect(window.history.state?.__journalGuard).toBeUndefined();
    expect(vi.mocked(window.history.go)).toHaveBeenCalledTimes(historyCallsBeforeUnmount);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("blocks a browser traversal while deferred discard work owns navigation", async () => {
    const discard = deferred<void>();
    mocks.discardWork.mockReturnValue(discard.promise);
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));
    expect(mocks.discardWork).toHaveBeenCalledOnce();

    const traverse = createTraverseNavigateEvent(navigationIndex - 1);
    const traversalAllowed = window.navigation.dispatchEvent(traverse);
    if (traversalAllowed) window.history.back();

    expect(traversalAllowed).toBe(false);
    expect(traverse.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe("/journal/new");
    expect(window.history.state?.__journalGuard).toBeTruthy();

    await act(async () => {
      discard.resolve();
      await discard.promise;
    });
    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
    expect(window.history.state).toEqual({ entry: "previous" });
  });

  it("does not overshoot the saved target when another Back queues during release", async () => {
    const discard = deferred<void>();
    mocks.discardWork.mockReturnValue(discard.promise);
    window.history.replaceState({ entry: "older" }, "", "/journal/older");
    window.history.pushState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard entry" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));

    await act(async () => {
      discard.resolve();
      await discard.promise;
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(window.location.pathname).toBe("/journal/previous"));
    expect(window.history.state).toEqual({ entry: "previous" });
    expect(window.navigation.traverseTo).toHaveBeenCalledWith(`entry-${navigationIndex}`);
  });

  it("finishes a deferred discard when exact guard restoration fails", async () => {
    const discard = deferred<void>();
    const restoration = deferred<NavigationHistoryEntry>();
    const finishedRestoration = deferred<NavigationHistoryEntry>();
    const release = deferred<NavigationHistoryEntry>();
    const finishedRelease = deferred<NavigationHistoryEntry>();
    mocks.discardWork.mockReturnValue(discard.promise);
    vi.mocked(window.navigation.traverseTo)
      .mockReturnValueOnce({
        committed: restoration.promise,
        finished: finishedRestoration.promise,
      })
      .mockReturnValueOnce({
        committed: release.promise,
        finished: finishedRelease.promise,
      });
    window.history.replaceState({ entry: "exact-target" }, "", "/journal/exact-target");
    window.history.pushState({ entry: "middle" }, "", "/journal/middle");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.go(-2));
    const discardButton = await screen.findByRole("button", { name: "Discard entry" });
    fireEvent.click(discardButton);
    act(() => commitTraversal(-2));
    await waitFor(() => expect(window.navigation.traverseTo).toHaveBeenCalledOnce());

    await act(async () => {
      discard.resolve();
      await discard.promise;
    });
    expect(screen.getByRole("button", { name: "Discard entry" })).toBeDisabled();

    await act(async () => {
      restoration.reject(new DOMException("restore failed", "AbortError"));
      finishedRestoration.reject(new DOMException("restore failed", "AbortError"));
      await Promise.allSettled([restoration.promise, finishedRestoration.promise]);
    });

    await waitFor(() => expect(window.navigation.traverseTo).toHaveBeenCalledTimes(2));
    await act(async () => {
      release.reject(new DOMException("release failed", "AbortError"));
      finishedRelease.reject(new DOMException("release failed", "AbortError"));
      await Promise.allSettled([release.promise, finishedRelease.promise]);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(window.location.pathname).toBe("/journal/exact-target"));
    expect(window.history.state).toEqual({ entry: "exact-target" });
    expect(vi.mocked(window.history.go).mock.calls.at(-1)).toEqual([-1]);
    expect(window.navigation.traverseTo).toHaveBeenCalledTimes(2);
  });

  it("keeps the guard armed until an in-flight discard continuation releases it", async () => {
    const discard = deferred<void>();
    mocks.discardWork.mockReturnValue(discard.promise);
    const view = renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard entry" }));
    mocks.upload.hasWork = false;
    view.rerender(screenWithClient(view.queryClient));

    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => {
      discard.resolve();
      await discard.promise;
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(window.history.state?.__journalGuard).toBeUndefined();
  });

  it("keeps the draft route guarded and explains a server-side discard failure", async () => {
    mocks.discardWork.mockImplementation(async () => {
      mocks.upload.phase = "error";
      throw new Error("Journal video could not be removed. Try again.");
    });
    window.history.replaceState({ entry: "previous" }, "", "/journal/previous");
    window.history.pushState({ entry: "journal-form" }, "", "/journal/new");
    const view = renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    act(() => window.history.back());
    const discardButton = await screen.findByRole("button", { name: "Discard entry" });
    fireEvent.click(discardButton);

    await waitFor(() => expect(discardButton).toBeEnabled());
    view.rerender(screenWithClient(view.queryClient));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Journal video could not be removed. Try again.",
    );
    expect(screen.getByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    expect(window.location.pathname).toBe("/journal/new");
    expect(window.history.state?.__journalGuard).toBeTruthy();
    expect(window.navigation.traverseTo).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("confirms bottom-nav navigation and releases the guard before routing", async () => {
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(await screen.findByRole("dialog", { name: "Discard journal entry confirmation" }))
      .toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard entry" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.discardWork).toHaveBeenCalledOnce();
    expect(window.history.state?.__journalGuard).toBeUndefined();
  });

  it("releases the guard and preserves the draft for related-drill creation", async () => {
    renderScreen();
    await waitFor(() => expect(window.history.state?.__journalGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Create related drill" }));

    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/drills/new?from=journal");
    expect(mocks.discardWork).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.history.state?.__journalGuard).toBeUndefined();
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(screenWithClient(queryClient)),
    queryClient,
  };
}

function screenWithClient(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <JournalUploadScreen />
    </QueryClientProvider>
  );
}

function installNavigationIndexTracking(
  getIndex: () => number,
  setIndex: (index: number) => void,
  getFurthestIndex: () => number,
) {
  const navigation = new EventTarget();
  Object.defineProperty(navigation, "currentEntry", {
    configurable: true,
    get: () => historyEntry(getIndex()),
  });
  vi.stubGlobal("navigation", navigation);

  const nativePushState = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    setIndex(getIndex() + 1);
    nativePushState(data, unused, url);
  });

  const nativeGo = window.history.go.bind(window.history);
  Object.defineProperty(navigation, "traverseTo", {
    configurable: true,
    value: vi.fn((key: string): NavigationResult => {
      const targetIndex = historyIndexForKey(key);
      if (targetIndex === null || targetIndex > getFurthestIndex()) {
        const committed = Promise.reject(
          new DOMException("Unknown history entry.", "InvalidStateError"),
        );
        const finished = committed.then((entry) => entry);
        return { committed, finished };
      }

      let resolve!: (entry: NavigationHistoryEntry) => void;
      let reject!: (reason?: unknown) => void;
      const committed = new Promise<NavigationHistoryEntry>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
      });
      const finished = committed.then((entry) => entry);
      queueMicrotask(() => {
        const event = createTraverseNavigateEvent(targetIndex);
        if (!navigation.dispatchEvent(event)) {
          reject(new DOMException("Traversal was canceled.", "AbortError"));
          return;
        }
        const delta = targetIndex - getIndex();
        setIndex(targetIndex);
        nativeGo(delta);
        resolve(historyEntry(targetIndex));
      });
      return { committed, finished };
    }),
  });

  vi.spyOn(window.history, "go").mockImplementation((delta = 0) => {
    queueMicrotask(() => {
      const targetIndex = getIndex() + delta;
      if (targetIndex < 0 || targetIndex > getFurthestIndex()) return;
      if (!navigation.dispatchEvent(createTraverseNavigateEvent(targetIndex))) return;
      setIndex(targetIndex);
      nativeGo(delta);
    });
  });

  const nativeBack = window.history.back.bind(window.history);
  vi.spyOn(window.history, "back").mockImplementation(() => {
    queueMicrotask(() => {
      const targetIndex = getIndex() - 1;
      if (targetIndex < 0) return;
      if (!navigation.dispatchEvent(createTraverseNavigateEvent(targetIndex))) return;
      setIndex(targetIndex);
      nativeBack();
    });
  });

  const nativeForward = window.history.forward.bind(window.history);
  vi.spyOn(window.history, "forward").mockImplementation(() => {
    queueMicrotask(() => {
      const targetIndex = getIndex() + 1;
      if (targetIndex > getFurthestIndex()) return;
      if (!navigation.dispatchEvent(createTraverseNavigateEvent(targetIndex))) return;
      setIndex(targetIndex);
      nativeForward();
    });
  });

  return (delta: number) => {
    const targetIndex = getIndex() + delta;
    if (targetIndex < 0 || targetIndex > getFurthestIndex()) return;
    setIndex(targetIndex);
    nativeGo(delta);
  };

}

function createTraverseNavigateEvent(index: number): NavigateEvent {
  const event = new Event("navigate", { cancelable: true });
  Object.defineProperties(event, {
    destination: { value: { index, key: historyKey(index), sameDocument: true } },
    navigationType: { value: "traverse" },
  });
  return event as NavigateEvent;
}

function historyEntry(index: number): NavigationHistoryEntry {
  return { index, key: historyKey(index) } as NavigationHistoryEntry;
}

function historyIndexForKey(key: string): number | null {
  const match = /^entry-(\d+)$/.exec(key);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : null;
}

function historyKey(index: number): string {
  return `entry-${index}`;
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
