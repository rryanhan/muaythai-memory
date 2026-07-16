import {
  captureDraftResponseSchema,
  captureTranscriptionResponseSchema,
} from "@/modules/capture/contracts";
import type {
  ApiClientOptions,
  CaptureDraftRequest,
  CaptureDraftResponse,
  CaptureTranscriptionResponse,
} from "./types";
import { fetchJson } from "./api-core";

export async function createCaptureDraft(
  input: CaptureDraftRequest,
  options: ApiClientOptions = {},
): Promise<CaptureDraftResponse> {
  return fetchJson("/api/capture/draft", captureDraftResponseSchema, options, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function transcribeCaptureRecording(
  audio: Blob,
  options: ApiClientOptions = {},
): Promise<CaptureTranscriptionResponse> {
  const formData = new FormData();
  const extension = audio.type.startsWith("audio/mp4")
    ? "m4a"
    : audio.type.startsWith("audio/ogg")
      ? "ogg"
      : "webm";
  formData.append("audio", audio, `capture.${extension}`);

  return fetchJson("/api/capture/transcribe", captureTranscriptionResponseSchema, options, {
    method: "POST",
    body: formData,
  });
}
