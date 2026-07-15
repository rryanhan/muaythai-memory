import { z } from "zod";
import {
  CaptureTranscriptionCancelledError,
  CaptureTranscriptionError,
} from "./errors";

export const MAX_CAPTURE_AUDIO_BYTES = 12 * 1024 * 1024;
export const CAPTURE_TRANSCRIPTION_TIMEOUT_MS = 180_000;

const supportedAudioTypes = new Set(["audio/mp4", "audio/ogg", "audio/webm"]);
const whisperResponseSchema = z.object({ text: z.string() });

export type CaptureAudioMetadata = {
  size: number;
  type: string;
};

export type TranscribeCaptureAudioOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  serverUrl?: string;
};

export type CaptureTranscriptionProviderOptions = {
  signal?: AbortSignal;
};

export interface CaptureTranscriptionProvider {
  transcribe(audio: File, options?: CaptureTranscriptionProviderOptions): Promise<string>;
}

export async function transcribeCaptureAudio(
  audio: File,
  options: TranscribeCaptureAudioOptions = {},
): Promise<string> {
  validateCaptureAudioMetadata(audio);

  const provider = process.env.CAPTURE_TRANSCRIPTION_PROVIDER?.trim() || "whisper-local";
  if (provider !== "whisper-local") {
    throw new CaptureTranscriptionError(
      `Unknown transcription provider: ${provider}.`,
      503,
      "Set CAPTURE_TRANSCRIPTION_PROVIDER to whisper-local.",
    );
  }

  const whisperProvider = new WhisperServerTranscriptionProvider({
    fetcher: options.fetcher,
    serverUrl: options.serverUrl,
  });
  return whisperProvider.transcribe(audio, { signal: options.signal });
}

export class WhisperServerTranscriptionProvider implements CaptureTranscriptionProvider {
  private readonly fetcher: typeof fetch;
  private readonly serverUrl: string;

  constructor(options: Pick<TranscribeCaptureAudioOptions, "fetcher" | "serverUrl"> = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.serverUrl = normalizeServerUrl(
      options.serverUrl ?? process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080/inference",
    );
  }

  async transcribe(
    audio: File,
    options: CaptureTranscriptionProviderOptions = {},
  ): Promise<string> {
    const formData = new FormData();
    formData.append("file", audio, audio.name || `capture.${extensionForMimeType(audio.type)}`);
    formData.append("response_format", "json");
    formData.append("language", "en");
    formData.append("temperature", "0");
    formData.append("prompt", MUAY_THAI_TRANSCRIPTION_PROMPT);

    let response: Response;
    try {
      response = await this.fetcher(this.serverUrl, {
        method: "POST",
        body: formData,
        signal: options.signal
          ? AbortSignal.any([
              options.signal,
              AbortSignal.timeout(CAPTURE_TRANSCRIPTION_TIMEOUT_MS),
            ])
          : AbortSignal.timeout(CAPTURE_TRANSCRIPTION_TIMEOUT_MS),
      });
    } catch (error) {
      if (options.signal?.aborted) throw new CaptureTranscriptionCancelledError();
      if (isTimeoutError(error)) {
        throw new CaptureTranscriptionError(
          "Local transcription took too long.",
          504,
          "Keep whisper-server running and try a shorter memo.",
        );
      }

      throw new CaptureTranscriptionError(
        "The app could not reach the local Whisper server.",
        503,
        "Run npm run whisper:serve in a second terminal.",
      );
    }

    if (!response.ok) {
      const detail = await readWhisperError(response);
      throw new CaptureTranscriptionError(
        detail || "The local Whisper server could not transcribe this recording.",
        response.status === 413 ? 413 : response.status === 415 ? 415 : 502,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new CaptureTranscriptionError("Whisper returned an unreadable response.", 502);
    }

    return parseWhisperTranscript(payload);
  }
}

export function validateCaptureAudioMetadata(audio: CaptureAudioMetadata): void {
  if (!Number.isFinite(audio.size) || audio.size <= 0) {
    throw new CaptureTranscriptionError("The recording did not contain any audio.", 422);
  }
  if (audio.size > MAX_CAPTURE_AUDIO_BYTES) {
    throw new CaptureTranscriptionError("The recording is larger than 12 MB.", 413);
  }

  const mimeType = normalizeCaptureMimeType(audio.type);
  if (!supportedAudioTypes.has(mimeType)) {
    throw new CaptureTranscriptionError(
      "This browser produced an unsupported audio format.",
      415,
    );
  }
}

export function parseWhisperTranscript(payload: unknown): string {
  const result = whisperResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new CaptureTranscriptionError("Whisper returned an unreadable response.", 502);
  }

  const transcript = result.data.text.trim();
  if (transcript.length < 2) {
    throw new CaptureTranscriptionError(
      "No clear speech was detected. Try recording again closer to the microphone.",
      422,
    );
  }
  return transcript;
}

export function normalizeCaptureMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function normalizeServerUrl(value: string): string {
  try {
    return new URL(value.trim()).toString();
  } catch {
    throw new CaptureTranscriptionError(
      "The local Whisper server URL is invalid.",
      503,
      "Set WHISPER_SERVER_URL to http://127.0.0.1:8080/inference.",
    );
  }
}

function extensionForMimeType(value: string): string {
  const normalized = normalizeCaptureMimeType(value);
  if (normalized === "audio/mp4") return "m4a";
  if (normalized === "audio/ogg") return "ogg";
  return "webm";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

async function readWhisperError(response: Response): Promise<string | null> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && "error" in payload) {
      return String(payload.error).slice(0, 240);
    }
  } catch {
    // The provider may return plain text for conversion failures.
  }
  return null;
}

const MUAY_THAI_TRANSCRIPTION_PROMPT = [
  "Muay Thai training vocabulary:",
  "jab, cross, hook, uppercut, teep, round kick, low kick, knee, elbow,",
  "clinch, sweep, parry, long guard, kick check, kick catch, slip, roll,",
  "pivot, switch step, step through, stance switch, shadowboxing, pad work, bag work.",
  "Common coaching phrases: keep the lead hand high, keep the right hand high,",
  "chin tucked, head off center, stay balanced, then reset.",
].join(" ");
