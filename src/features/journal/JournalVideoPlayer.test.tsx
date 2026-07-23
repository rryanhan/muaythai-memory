import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalVideoPlayer } from "./JournalVideoPlayer";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JournalVideoPlayer autoplay", () => {
  it("attempts autoplay once per source without undoing later pause or mute choices", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(
      <JournalVideoPlayer src="blob:first" autoPlay initialMuted />,
    );
    const video = screen.getByLabelText("Training video") as HTMLVideoElement;
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: HTMLMediaElement.HAVE_FUTURE_DATA,
    });

    fireEvent.canPlay(video);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    fireEvent.play(video);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(video.muted).toBe(false);
    video.pause();
    fireEvent.pause(video);

    fireEvent.canPlay(video);
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);

    rerender(<JournalVideoPlayer src="blob:second" autoPlay initialMuted />);
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: HTMLMediaElement.HAVE_FUTURE_DATA,
    });
    fireEvent.canPlay(video);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    fireEvent.canPlay(video);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
