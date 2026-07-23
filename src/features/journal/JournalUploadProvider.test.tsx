import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
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

import { JournalUploadProvider, useJournalUpload } from "./JournalUploadProvider";

beforeEach(() => {
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
