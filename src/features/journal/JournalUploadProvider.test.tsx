import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
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
  usePathname: () => "/",
  useRouter: () => navigationMocks,
}));

vi.mock("./create-video-poster", () => ({
  createPosterFromImage: posterMocks.createPosterFromImage,
  createVideoPoster: posterMocks.createVideoPoster,
}));

vi.mock("@/data", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data")>(),
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

import { JournalApiError } from "@/data";
import { JournalUploadProvider, useJournalUpload } from "./JournalUploadProvider";

beforeEach(() => {
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

    renderProvider(<UploadHarness />);
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

function UploadHarness() {
  const upload = useJournalUpload();
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
      <button type="button" onClick={() => void upload.cancelUpload()}>
        Cancel upload
      </button>
      <output>{upload.phase}</output>
      <output>{upload.error}</output>
      <output data-testid="file-name">{upload.draft.file?.name ?? "none"}</output>
    </>
  );
}

function renderProvider(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <JournalUploadProvider>{children}</JournalUploadProvider>
    </QueryClientProvider>,
  );
}

async function chooseReadyFile(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Choose video" }));
  expect(posterMocks.pending).toHaveLength(1);
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
