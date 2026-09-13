import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceCapturePanel } from "./VoiceCapturePanel";

vi.mock("@/data/capture", () => ({
  transcribeCaptureRecording: vi.fn(),
}));

vi.mock("./VoiceWaveform", () => ({
  VoiceWaveform: () => <div data-testid="voice-waveform" />,
}));

const originalSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  vi.unstubAllGlobals();
  restoreProperty(window, "isSecureContext", originalSecureContext);
  restoreProperty(navigator, "mediaDevices", originalMediaDevices);
});

describe("VoiceCapturePanel recorder teardown", () => {
  it("stops the microphone stream when MediaRecorder.stop throws during unmount", async () => {
    const user = userEvent.setup();
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recorders: ThrowingMediaRecorder[] = [];

    class ThrowingMediaRecorder extends EventTarget {
      static isTypeSupported() {
        return true;
      }

      readonly mimeType: string;
      state: RecordingState = "inactive";
      readonly requestData = vi.fn();
      readonly stop = vi.fn(() => {
        throw new Error("recorder stop failed");
      });

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType ?? "";
        recorders.push(this);
      }

      start() {
        this.state = "recording";
      }
    }

    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("MediaRecorder", ThrowingMediaRecorder);

    const { unmount } = render(
      <VoiceCapturePanel
        onTranscript={vi.fn()}
        onUseText={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByRole("button", { name: "Stop & transcribe" })).toBeVisible();
    expect(recorders).toHaveLength(1);

    expect(() => unmount()).not.toThrow();
    expect(recorders[0]?.stop).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});

function restoreProperty(
  target: Window | Navigator,
  property: "isSecureContext" | "mediaDevices",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}
