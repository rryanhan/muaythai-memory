import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  completeJournalEntryUpload: vi.fn(),
  createJournalUpload: vi.fn(),
  deleteJournalEntry: vi.fn(),
  refreshJournalUpload: vi.fn(),
  uploadJournalEntryPoster: vi.fn(),
}));

const uploadMocks = vi.hoisted(() => ({
  uploadJournalVideo: vi.fn(),
  validateJournalVideoFile: vi.fn(),
}));

const posterMocks = vi.hoisted(() => ({
  createPosterFromImage: vi.fn(),
  createVideoPoster: vi.fn(),
  pending: [] as Array<{
    signal: AbortSignal;
    resolve: (poster: {
      file: File;
      timeSeconds: number;
    } | null) => void;
  }>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => navigationMocks,
}));

vi.mock("./create-video-poster", () => ({
  createPosterFromImage: posterMocks.createPosterFromImage,
  createVideoPoster: posterMocks.createVideoPoster,
}));

vi.mock("@/data/journal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/journal")>(),
  completeJournalEntryUpload: dataMocks.completeJournalEntryUpload,
  createJournalUpload: dataMocks.createJournalUpload,
  deleteJournalEntry: dataMocks.deleteJournalEntry,
  refreshJournalUpload: dataMocks.refreshJournalUpload,
  uploadJournalEntryPoster: dataMocks.uploadJournalEntryPoster,
}));

vi.mock("./upload-journal-video", () => ({
  uploadJournalVideo: uploadMocks.uploadJournalVideo,
  validateJournalVideoFile: uploadMocks.validateJournalVideoFile,
}));

import { JournalApiError } from "@/data/journal-error";
import { JournalUploadProvider, useJournalUpload } from "./JournalUploadProvider";

beforeEach(() => {
  navigationMocks.pathname = "/";
  navigationMocks.push.mockReset();
  navigationMocks.replace.mockReset();
  dataMocks.completeJournalEntryUpload.mockReset();
  dataMocks.createJournalUpload.mockReset();
  dataMocks.deleteJournalEntry.mockReset();
  dataMocks.refreshJournalUpload.mockReset();
  dataMocks.uploadJournalEntryPoster.mockReset().mockResolvedValue(undefined);
  uploadMocks.uploadJournalVideo.mockReset().mockResolvedValue(undefined);
  uploadMocks.validateJournalVideoFile.mockReset();
  posterMocks.pending.length = 0;
  posterMocks.createPosterFromImage.mockReset();
  posterMocks.createVideoPoster.mockReset();
  posterMocks.createVideoPoster.mockImplementation((
    _file: File,
    options: { signal: AbortSignal },
  ) => new Promise((resolve) => {
    posterMocks.pending.push({ signal: options.signal, resolve });
  }));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("JournalUploadProvider draft date baseline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 12, 23, 59));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays pristine across midnight and refreshes the default date on journal entry", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <JournalUploadProvider>
          <DraftStateHarness />
        </JournalUploadProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-12");
    expect(screen.getByTestId("has-work")).toHaveTextContent("no");

    act(() => vi.setSystemTime(new Date(2026, 8, 13, 0, 1)));
    fireEvent.click(screen.getByRole("button", { name: "Refresh provider" }));
    expect(screen.getByTestId("has-work")).toHaveTextContent("no");
    expect(screen.queryByText("Journal draft waiting")).not.toBeInTheDocument();

    navigationMocks.pathname = "/journal/new";
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <JournalUploadProvider>
          <DraftStateHarness />
        </JournalUploadProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-13"));
    expect(screen.getByTestId("has-work")).toHaveTextContent("no");

    fireEvent.click(screen.getByRole("button", { name: "Choose earlier date" }));
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-11");
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");

    act(() => vi.setSystemTime(new Date(2026, 8, 14, 0, 1)));
    fireEvent.click(screen.getByRole("button", { name: "Refresh provider" }));
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-11");
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");
  });

  it("commits the fresh default date when a related drill is created on another route", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const provider = () => (
      <QueryClientProvider client={queryClient}>
        <JournalUploadProvider>
          <DraftStateHarness />
        </JournalUploadProvider>
      </QueryClientProvider>
    );
    const view = render(provider());

    act(() => vi.setSystemTime(new Date(2026, 8, 13, 0, 1)));
    navigationMocks.pathname = "/journal/new";
    view.rerender(provider());
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-13");
    expect(screen.getByTestId("has-work")).toHaveTextContent("no");

    navigationMocks.pathname = "/drills/new";
    view.rerender(provider());
    fireEvent.click(screen.getByRole("button", { name: "Choose related drill" }));
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-13");
    expect(screen.getByTestId("drill-id")).toHaveTextContent("00000000-0000-4000-8000-000000000010");
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");

    navigationMocks.pathname = "/journal/new";
    view.rerender(provider());
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-13");
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");
  });

  it("preserves an explicitly reselected old default date after midnight", () => {
    renderProvider(<DraftStateHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Choose earlier date" }));
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-11");

    act(() => vi.setSystemTime(new Date(2026, 8, 13, 0, 1)));
    fireEvent.click(screen.getByRole("button", { name: "Choose original date" }));
    expect(screen.getByTestId("draft-date")).toHaveTextContent("2026-09-12");
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");
  });
});

describe("JournalUploadProvider unload guard", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("attaches beforeunload only while work exists", async () => {
    renderProvider(<UnloadGuardHarness />);

    expect(beforeUnloadCalls(addEventListenerSpy)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Start draft" }));

    await waitFor(() => expect(beforeUnloadCalls(addEventListenerSpy)).toHaveLength(1));
    expect(screen.getByTestId("has-work")).toHaveTextContent("yes");
    const handler = beforeUnloadCalls(addEventListenerSpy)[0][1];

    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));

    await waitFor(() => {
      expect(removeEventListenerSpy).toHaveBeenCalledWith("beforeunload", handler);
    });
    expect(screen.getByTestId("has-work")).toHaveTextContent("no");
  });
});

describe("JournalUploadProvider poster replacement", () => {
  it("aborts the stale decoder and cannot commit its poster after the replacement", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <JournalUploadProvider>
          <PosterHarness />
        </JournalUploadProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose first" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose second" }));
    await waitFor(() => expect(
      posterMocks.createVideoPoster.mock.calls.map(([file]) => file.name),
    ).toEqual(["first.mp4", "second.mp4"]));
    expect(posterMocks.pending).toHaveLength(2);
    expect(posterMocks.pending[0].signal.aborted).toBe(true);

    act(() => {
      posterMocks.pending[1].resolve({
        file: new File(["second"], "second-poster.jpg", { type: "image/jpeg" }),
        timeSeconds: 2,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("poster-url")).toHaveTextContent("blob:second-poster.jpg");
    });

    act(() => {
      posterMocks.pending[0].resolve({
        file: new File(["first"], "first-poster.jpg", { type: "image/jpeg" }),
        timeSeconds: 1,
      });
    });
    await Promise.resolve();
    expect(screen.getByTestId("poster-url")).toHaveTextContent("blob:second-poster.jpg");
  });
});

describe("JournalUploadProvider intent recovery", () => {
  it("starts only one upload when invoked twice in the same event", async () => {
    const currentIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/entry/video.mp4",
      "token",
    );
    let resolveCreate: ((intent: typeof currentIntent) => void) | undefined;
    dataMocks.createJournalUpload.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    dataMocks.completeJournalEntryUpload.mockResolvedValue({ id: currentIntent.entryId });

    renderProvider(<UploadHarness />);
    await chooseReadyFile();

    fireEvent.click(screen.getByRole("button", { name: "Start upload twice" }));
    await waitFor(() => expect(dataMocks.createJournalUpload).toHaveBeenCalledOnce());

    act(() => resolveCreate?.(currentIntent));
    await screen.findByText("ready");

    expect(uploadMocks.uploadJournalVideo).toHaveBeenCalledOnce();
    expect(dataMocks.uploadJournalEntryPoster).toHaveBeenCalledOnce();
    expect(dataMocks.completeJournalEntryUpload).toHaveBeenCalledOnce();
  });

  it("refreshes an expired upload token without creating a second entry", async () => {
    const oldIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/entry/video.mp4",
      "expired-token",
    );
    const refreshedIntent = uploadIntent(oldIntent.entryId, oldIntent.upload.path, "fresh-token");
    dataMocks.createJournalUpload.mockResolvedValue(oldIntent);
    dataMocks.refreshJournalUpload.mockResolvedValue(refreshedIntent);
    uploadMocks.uploadJournalVideo
      .mockRejectedValueOnce(new Error("Upload authorization expired."))
      .mockResolvedValueOnce(undefined);
    dataMocks.completeJournalEntryUpload.mockResolvedValue({ id: oldIntent.entryId });

    const queryClient = renderProvider(<UploadHarness />);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    await chooseReadyFile();

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Upload authorization expired.");
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("ready");

    expect(dataMocks.createJournalUpload).toHaveBeenCalledOnce();
    expect(dataMocks.refreshJournalUpload).toHaveBeenCalledWith(
      oldIntent.entryId,
      expect.objectContaining({ requestInit: expect.any(Object) }),
    );
    expect(uploadMocks.uploadJournalVideo).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo.mock.calls[1][0].intent).toEqual(refreshedIntent);
    expect(dataMocks.uploadJournalEntryPoster).toHaveBeenCalledOnce();
    expect(dataMocks.completeJournalEntryUpload).toHaveBeenCalledWith(
      oldIntent.entryId,
      expect.any(Object),
    );
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["journal"],
      ["drill-journal"],
    ]);
  });

  it("retries a transient token refresh with the existing entry and a fresh token", async () => {
    const oldIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/entry/video.mp4",
      "expired-token",
    );
    const refreshedIntent = uploadIntent(oldIntent.entryId, oldIntent.upload.path, "fresh-token");
    dataMocks.createJournalUpload.mockResolvedValue(oldIntent);
    dataMocks.refreshJournalUpload
      .mockRejectedValueOnce(new Error("Upload access could not be refreshed."))
      .mockResolvedValueOnce(refreshedIntent);
    uploadMocks.uploadJournalVideo
      .mockRejectedValueOnce(new Error("Upload authorization expired."))
      .mockResolvedValueOnce(undefined);
    dataMocks.completeJournalEntryUpload.mockResolvedValue({ id: oldIntent.entryId });

    renderProvider(<UploadHarness />);
    await chooseReadyFile();

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Upload authorization expired.");
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Upload access could not be refreshed.");
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("ready");

    expect(dataMocks.createJournalUpload).toHaveBeenCalledOnce();
    expect(dataMocks.refreshJournalUpload).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo.mock.calls[1][0].intent).toEqual(refreshedIntent);
    expect(dataMocks.completeJournalEntryUpload).toHaveBeenCalledWith(
      oldIntent.entryId,
      expect.any(Object),
    );
  });

  it("recreates a deleted rejected entry once and preserves the draft through the retry", async () => {
    const oldIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/old-entry/video.mp4",
      "old-token",
    );
    const replacementIntent = uploadIntent(
      "22222222-2222-4222-8222-222222222222",
      "user/new-entry/video.mp4",
      "new-token",
    );
    dataMocks.createJournalUpload
      .mockResolvedValueOnce(oldIntent)
      .mockResolvedValueOnce(replacementIntent);
    dataMocks.completeJournalEntryUpload
      .mockRejectedValueOnce(new Error("The uploaded video did not match the selected file."))
      .mockRejectedValueOnce(new JournalApiError("Journal entry not found.", 404))
      .mockResolvedValueOnce({ id: replacementIntent.entryId });

    renderProvider(<UploadHarness />);
    await chooseReadyFile();

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("The uploaded video did not match the selected file.");
    expect(screen.getByTestId("file-name")).toHaveTextContent("round.mp4");

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("ready");

    expect(dataMocks.createJournalUpload).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo.mock.calls[1][0].intent).toEqual(replacementIntent);
    expect(dataMocks.uploadJournalEntryPoster).toHaveBeenCalledTimes(2);
    expect(dataMocks.completeJournalEntryUpload.mock.calls.map(([id]) => id)).toEqual([
      oldIntent.entryId,
      oldIntent.entryId,
      replacementIntent.entryId,
    ]);
    expect(dataMocks.refreshJournalUpload).not.toHaveBeenCalled();
  });

  it("recreates a missing intent once when a poster retry receives 404", async () => {
    const oldIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/old-entry/video.mp4",
      "old-token",
    );
    const replacementIntent = uploadIntent(
      "22222222-2222-4222-8222-222222222222",
      "user/new-entry/video.mp4",
      "new-token",
    );
    dataMocks.createJournalUpload
      .mockResolvedValueOnce(oldIntent)
      .mockResolvedValueOnce(replacementIntent);
    dataMocks.uploadJournalEntryPoster
      .mockRejectedValueOnce(new Error("Poster upload interrupted."))
      .mockRejectedValueOnce(new JournalApiError("Journal entry not found.", 404))
      .mockResolvedValueOnce(undefined);
    dataMocks.completeJournalEntryUpload.mockResolvedValueOnce({ id: replacementIntent.entryId });

    renderProvider(<UploadHarness />);
    await chooseReadyFile();

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Poster upload interrupted.");
    expect(screen.getByTestId("file-name")).toHaveTextContent("round.mp4");

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("ready");

    expect(dataMocks.createJournalUpload).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo).toHaveBeenCalledTimes(2);
    expect(uploadMocks.uploadJournalVideo.mock.calls[1][0].intent).toEqual(replacementIntent);
    expect(dataMocks.uploadJournalEntryPoster.mock.calls.map(([id]) => id)).toEqual([
      oldIntent.entryId,
      oldIntent.entryId,
      replacementIntent.entryId,
    ]);
    expect(dataMocks.completeJournalEntryUpload).toHaveBeenCalledWith(
      replacementIntent.entryId,
      expect.any(Object),
    );
    expect(dataMocks.refreshJournalUpload).not.toHaveBeenCalled();
  });

  it("keeps the staged intent and draft when cancellation DELETE fails", async () => {
    const currentIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/entry/video.mp4",
      "token",
    );
    dataMocks.createJournalUpload.mockResolvedValue(currentIntent);
    uploadMocks.uploadJournalVideo.mockRejectedValueOnce(new Error("Network interrupted."));
    dataMocks.deleteJournalEntry
      .mockRejectedValueOnce(new JournalApiError("Journal video could not be removed. Try again.", 503))
      .mockResolvedValueOnce(currentIntent.entryId);

    renderProvider(<UploadHarness />);
    await chooseReadyFile();
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Network interrupted.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await screen.findByText("Journal video could not be removed. Try again.");
    expect(screen.getByTestId("file-name")).toHaveTextContent("round.mp4");

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await waitFor(() => expect(screen.getByTestId("file-name")).toHaveTextContent("none"));
    expect(dataMocks.deleteJournalEntry).toHaveBeenCalledTimes(2);
  });

  it("rejects discardWork when the staged entry cannot be deleted", async () => {
    const currentIntent = uploadIntent(
      "11111111-1111-4111-8111-111111111111",
      "user/entry/video.mp4",
      "token",
    );
    let discardWork: (() => Promise<void>) | null = null;
    dataMocks.createJournalUpload.mockResolvedValue(currentIntent);
    uploadMocks.uploadJournalVideo.mockRejectedValueOnce(new Error("Network interrupted."));
    dataMocks.deleteJournalEntry.mockRejectedValueOnce(
      new JournalApiError("Journal video could not be removed. Try again.", 503),
    );

    renderProvider(
      <UploadHarness captureDiscardWork={(nextDiscardWork) => { discardWork = nextDiscardWork; }} />,
    );
    await chooseReadyFile();
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    await screen.findByText("Network interrupted.");

    expect(discardWork).not.toBeNull();
    await act(async () => {
      await expect(discardWork!()).rejects.toThrow("Journal video could not be removed. Try again.");
    });

    expect(screen.getByTestId("file-name")).toHaveTextContent("round.mp4");
    expect(screen.getByText("Journal video could not be removed. Try again.")).toBeInTheDocument();
  });
});

function PosterHarness() {
  const upload = useJournalUpload();
  return (
    <>
      <button
        type="button"
        onClick={() => upload.setFile(new File(["first"], "first.mp4", { type: "video/mp4" }))}
      >
        Choose first
      </button>
      <button
        type="button"
        onClick={() => upload.setFile(new File(["second"], "second.mp4", { type: "video/mp4" }))}
      >
        Choose second
      </button>
      <output data-testid="poster-url">{upload.draft.posterPreviewUrl}</output>
    </>
  );
}

function UploadHarness({
  captureDiscardWork,
}: {
  captureDiscardWork?: (discardWork: () => Promise<void>) => void;
} = {}) {
  const upload = useJournalUpload();
  captureDiscardWork?.(upload.discardWork);
  return (
    <>
      <button
        type="button"
        onClick={() => upload.setFile(new File(["video"], "round.mp4", { type: "video/mp4" }))}
      >
        Choose video
      </button>
      <button type="button" onClick={() => void upload.startUpload()}>
        Start upload
      </button>
      <button
        type="button"
        onClick={() => {
          void upload.startUpload();
          void upload.startUpload();
        }}
      >
        Start upload twice
      </button>
      <button type="button" onClick={() => void upload.cancelUpload()}>
        Cancel upload
      </button>
      <output>{upload.phase}</output>
      <output>{upload.error}</output>
      <output data-testid="file-name">{upload.draft.file?.name ?? "none"}</output>
    </>
  );
}

function DraftStateHarness() {
  const upload = useJournalUpload();
  return (
    <>
      <button
        type="button"
        onClick={() => upload.setDurationMs(upload.draft.durationMs)}
      >
        Refresh provider
      </button>
      <button type="button" onClick={() => upload.setOccurredOn("2026-09-11")}>
        Choose earlier date
      </button>
      <button type="button" onClick={() => upload.setOccurredOn("2026-09-12")}>
        Choose original date
      </button>
      <button
        type="button"
        onClick={() => upload.setDrillId("00000000-0000-4000-8000-000000000010")}
      >
        Choose related drill
      </button>
      <output data-testid="draft-date">{upload.draft.occurredOn}</output>
      <output data-testid="drill-id">{upload.draft.drillId}</output>
      <output data-testid="has-work">{upload.hasWork ? "yes" : "no"}</output>
    </>
  );
}

function UnloadGuardHarness() {
  const upload = useJournalUpload();
  return (
    <>
      <button type="button" onClick={() => upload.setCaption("Round notes")}>Start draft</button>
      <button type="button" onClick={() => upload.setCaption("")}>Clear draft</button>
      <output data-testid="has-work">{upload.hasWork ? "yes" : "no"}</output>
    </>
  );
}

function beforeUnloadCalls(spy: ReturnType<typeof vi.spyOn>) {
  return (spy.mock.calls as unknown[][]).filter(([type]) => type === "beforeunload");
}

function renderProvider(children: React.ReactNode): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <JournalUploadProvider>{children}</JournalUploadProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

async function chooseReadyFile(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Choose video" }));
  await waitFor(() => expect(posterMocks.pending).toHaveLength(1));
  act(() => {
    posterMocks.pending[0].resolve({
      file: new File(["poster"], "poster.webp", { type: "image/webp" }),
      timeSeconds: 1,
    });
  });
  await waitFor(() => expect(screen.getByTestId("file-name")).toHaveTextContent("round.mp4"));
}

function uploadIntent(entryId: string, path: string, token: string) {
  return {
    entryId,
    upload: {
      endpoint: "https://staging.storage.supabase.co/storage/v1/upload/resumable/sign",
      path,
      token,
    },
  };
}
