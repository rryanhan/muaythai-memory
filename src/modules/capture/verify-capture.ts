import assert from "node:assert/strict";
import {
  CAPTURE_CLIENT_TRANSCRIPTION_TIMEOUT_MS,
  CAPTURE_FINALIZATION_TIMEOUT_MS,
  CAPTURE_MIME_PREFERENCES,
  chooseCaptureMimeType,
  formatRecordingDuration,
  MAX_VOICE_MEMO_MS,
} from "@/features/capture/recorder";
import {
  appendWaveformPoint,
  computeWaveformPoint,
  WAVEFORM_HISTORY_SIZE,
  WAVEFORM_SAMPLE_INTERVAL_MS,
} from "@/features/capture/waveform";
import { isCurrentCaptureCleanup } from "@/features/capture/capture-session";
import {
  getVoiceCancelTransition,
  getVoiceFinalizationTimeoutTransition,
  getVoiceStopTransition,
  getVoiceTranscriptionFailureTransition,
  hasUnsavedVoiceWork,
  isCurrentVoiceAttempt,
  shouldRecorderStopSetIdle,
} from "@/features/capture/voice-state";
import { mergeDrillCleanup, type DrillDirtyFields } from "@/features/drills/cleanup-merge";
import { createModelCaptureDraftSchema, modelCaptureDraftSchema } from "./contracts";
import {
  CaptureDraftGenerationError,
  CaptureTranscriptionCancelledError,
  CaptureTranscriptionError,
} from "./errors";
import { parseOpenAiCaptureResponse } from "./providers/openai";
import {
  MAX_CAPTURE_AUDIO_BYTES,
  normalizeCaptureMimeType,
  parseWhisperTranscript,
  transcribeCaptureAudio,
  validateCaptureAudioMetadata,
} from "./transcription";
verifyCaptureContract();
verifyOpenAiCaptureResponse();
verifyCleanupMerge();
verifyRecorderRules();
verifyVoiceTransitions();
verifyCleanupIdentity();
verifyWaveformRules();
verifyTranscriptionRules();
void verifyTranscriptionProvider()
  .then(() => {
    console.log(
      "Capture verification passed: taxonomy, cleanup, recording, and transcription rules are stable.",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

function verifyCaptureContract() {
  const baseDraft = {
    title: "Cross Slip Uppercut Exit",
    notes: "Keep the right hand high.",
    steps: ["Slip outside the cross.", "Throw the left uppercut."],
    trainingMethodSlugs: ["pad-work"],
    tagSlugs: ["cross", "slip", "uppercut"],
  };

  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: null }).success,
    false,
    "Model summary should not accept null.",
  );
  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: "" }).success,
    false,
    "Model summary should not accept an empty string.",
  );
  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: "Practice the slip, uppercut, and exit sequence." }).success,
    true,
    "Model summary should accept a factual sentence.",
  );

  const constrainedSchema = createModelCaptureDraftSchema(
    ["pad-work", "partner-drill"],
    ["cross", "hook", "shift-kick", "rear-kick", "feint", "stance-switch"],
  );
  assert.equal(
    constrainedSchema.safeParse({
      ...baseDraft,
      summary: "Practice disguising a stance-shifting kick behind a cross.",
      trainingMethodSlugs: ["pad-work", "partner-drill"],
      tagSlugs: ["cross", "hook", "shift-kick", "rear-kick", "feint", "stance-switch"],
    }).success,
    true,
  );
  assert.equal(
    constrainedSchema.safeParse({
      ...baseDraft,
      summary: "Invalid taxonomy fixture.",
      trainingMethodSlugs: ["unknown-method"],
    }).success,
    false,
    "AI capture must reject Training Methods outside the active taxonomy.",
  );
  assert.equal(
    constrainedSchema.safeParse({
      ...baseDraft,
      summary: "Invalid taxonomy fixture.",
      tagSlugs: ["unknown-tag"],
    }).success,
    false,
    "AI capture must reject tags outside the active standard taxonomy.",
  );
}

function verifyOpenAiCaptureResponse() {
  const validDraft = {
    title: "Jab Cross Low Kick",
    summary: "Practice a jab-cross combination finishing with a rear low kick.",
    notes: "Keep the right hand high.",
    steps: ["Throw the jab.", "Throw the cross.", "Finish with the rear low kick."],
    trainingMethodSlugs: ["pad-work"],
    tagSlugs: ["jab", "cross", "low-kick"],
  };

  assert.deepEqual(
    parseOpenAiCaptureResponse({
      status: "completed",
      output_text: JSON.stringify(validDraft),
    }),
    validDraft,
  );
  assert.throws(
    () =>
      parseOpenAiCaptureResponse({
        status: "incomplete",
        output_text: "",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    (error: unknown) =>
      error instanceof CaptureDraftGenerationError && error.message.includes("output space"),
  );
  assert.throws(
    () => parseOpenAiCaptureResponse({ status: "completed", output_text: "" }),
    CaptureDraftGenerationError,
  );
  assert.throws(
    () => parseOpenAiCaptureResponse({ status: "completed", output_text: "not json" }),
    CaptureDraftGenerationError,
  );
}

function verifyCleanupMerge() {
  const current = {
    title: "My edited title",
    summary: "",
    notes: "Original cue",
    steps: ["User-edited step"],
    trainingMethodSlugs: ["partner-drill"],
    tagSlugs: ["cross"],
  };
  const dirty: DrillDirtyFields = {
    title: true,
    summary: false,
    notes: false,
    steps: true,
    trainingMethodSlugs: true,
    tagSlugs: false,
  };
  const suggestion = {
    title: "AI title",
    summary: "AI summary",
    notes: "Cleaned cue",
    steps: ["AI step one", "AI step two"],
    trainingMethodSlugs: ["pad-work", "partner-drill"],
    tagSlugs: ["cross", "hook", "feint"],
  };
  const result = mergeDrillCleanup(current, dirty, suggestion);

  assert.equal(result.applied.title, current.title, "Dirty title should not be replaced.");
  assert.deepEqual(result.applied.steps, current.steps, "Dirty steps should remain one owned collection.");
  assert.equal(result.applied.summary, suggestion.summary, "Untouched summary should update.");
  assert.equal(result.applied.notes, suggestion.notes, "Untouched notes should update.");
  assert.deepEqual(
    result.applied.trainingMethodSlugs,
    current.trainingMethodSlugs,
    "User-edited Training Methods should not be replaced.",
  );
  assert.deepEqual(result.applied.tagSlugs, suggestion.tagSlugs, "Untouched tags should update.");
  assert.equal(result.pending.title, suggestion.title, "Dirty title should be offered for review.");
  assert.deepEqual(result.pending.steps, suggestion.steps, "Dirty steps should be offered for review.");
  assert.deepEqual(
    result.pending.trainingMethodSlugs,
    suggestion.trainingMethodSlugs,
    "AI Training Methods should remain available as a suggestion.",
  );
  assert.equal(result.pending.summary, undefined);
  assert.equal(result.pending.notes, undefined);
  assert.equal(result.pending.tagSlugs, undefined);
}

function verifyRecorderRules() {
  assert.equal(MAX_VOICE_MEMO_MS, 120_000, "Voice memos should stop at two minutes.");
  assert.equal(CAPTURE_FINALIZATION_TIMEOUT_MS, 5_000);
  assert.equal(CAPTURE_CLIENT_TRANSCRIPTION_TIMEOUT_MS, 190_000);
  assert.equal(
    chooseCaptureMimeType((mimeType) => mimeType === "audio/webm;codecs=opus"),
    "audio/webm;codecs=opus",
  );
  assert.equal(
    chooseCaptureMimeType((mimeType) => mimeType === "audio/mp4" || mimeType === "audio/webm"),
    "audio/mp4",
    "MP4 should win when the browser supports it.",
  );
  assert.equal(chooseCaptureMimeType(() => false), undefined);
  assert.deepEqual(CAPTURE_MIME_PREFERENCES.slice(0, 3), [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
  ]);
  assert.equal(formatRecordingDuration(0), "0:00");
  assert.equal(formatRecordingDuration(61_900), "1:01");
  assert.equal(formatRecordingDuration(MAX_VOICE_MEMO_MS), "2:00");
}

function verifyVoiceTransitions() {
  assert.deepEqual(getVoiceCancelTransition("requesting", false), {
    nextStatus: "idle",
    discardAudio: true,
    resetElapsed: true,
  });
  assert.deepEqual(getVoiceCancelTransition("recording", false), {
    nextStatus: "idle",
    discardAudio: true,
    resetElapsed: true,
  });
  assert.deepEqual(getVoiceCancelTransition("transcribing", true), {
    nextStatus: "recorded",
    discardAudio: false,
    resetElapsed: false,
  });
  assert.deepEqual(getVoiceCancelTransition("transcribing", false), {
    nextStatus: "idle",
    discardAudio: true,
    resetElapsed: true,
  });
  assert.equal(hasUnsavedVoiceWork("recording", false), true);
  assert.equal(hasUnsavedVoiceWork("finalizing", false), true);
  assert.equal(hasUnsavedVoiceWork("transcribing", true), true);
  assert.equal(hasUnsavedVoiceWork("recorded", true), true);
  assert.equal(hasUnsavedVoiceWork("error", true), true);
  assert.equal(hasUnsavedVoiceWork("idle", false), false);
  assert.deepEqual(getVoiceStopTransition(4_260, MAX_VOICE_MEMO_MS), {
    nextStatus: "finalizing",
    elapsedMs: 4_260,
  });
  assert.equal(
    getVoiceStopTransition(MAX_VOICE_MEMO_MS + 2_000, MAX_VOICE_MEMO_MS).elapsedMs,
    MAX_VOICE_MEMO_MS,
    "Stopping should freeze at the two-minute limit.",
  );
  assert.equal(shouldRecorderStopSetIdle(true, false), true);
  assert.equal(
    shouldRecorderStopSetIdle(true, true),
    false,
    "A stop event following a recorder error must not overwrite the error state.",
  );
  assert.equal(shouldRecorderStopSetIdle(false, false), false);
  assert.deepEqual(getVoiceFinalizationTimeoutTransition(true), {
    nextStatus: "recorded",
    retainAudio: true,
    message: "Audio finalization took too long. The recording was kept for retry.",
  });
  assert.deepEqual(getVoiceFinalizationTimeoutTransition(false), {
    nextStatus: "error",
    retainAudio: false,
    message: "The browser could not finish the recording. Record the memo again.",
  });
  assert.equal(isCurrentVoiceAttempt(4, 4, null), true);
  assert.equal(isCurrentVoiceAttempt(4, 5, null), false, "Late recorder events must be ignored.");
  assert.equal(
    isCurrentVoiceAttempt(4, 4, 4),
    false,
    "A finalized attempt must not start duplicate transcription.",
  );
  assert.deepEqual(
    getVoiceTranscriptionFailureTransition(true, "Timed out."),
    {
      nextStatus: "recorded",
      retainAudio: true,
      message: "Timed out.",
    },
  );
  assert.deepEqual(
    getVoiceTranscriptionFailureTransition(false, "Unexpected abort."),
    {
      nextStatus: "error",
      retainAudio: false,
      message: "Unexpected abort.",
    },
  );
}

function verifyCleanupIdentity() {
  assert.equal(isCurrentCaptureCleanup({ requestId: 4, sessionId: 9 }, 4, 9), true);
  assert.equal(
    isCurrentCaptureCleanup({ requestId: 3, sessionId: 9 }, 4, 9),
    false,
    "A late request from the current transcript must be ignored.",
  );
  assert.equal(
    isCurrentCaptureCleanup({ requestId: 4, sessionId: 8 }, 4, 9),
    false,
    "A response from an older transcript revision must be ignored.",
  );
}

function verifyWaveformRules() {
  const silence = new Uint8Array(1024).fill(128);
  const lowNoise = new Uint8Array(1024).fill(129);
  const loudNegativeInput = new Uint8Array(1024);
  const loudPositiveInput = new Uint8Array(1024);
  for (let index = 0; index < loudNegativeInput.length; index += 1) {
    loudNegativeInput[index] = index % 2 === 0 ? 255 : 0;
    loudPositiveInput[index] = index % 2 === 0 ? 0 : 255;
  }

  assert.equal(computeWaveformPoint(silence, 0), 0, "Silence should stay on the baseline.");
  assert.equal(computeWaveformPoint(lowNoise, 0), 0, "Low microphone noise should be gated.");
  assert.ok(
    computeWaveformPoint(loudNegativeInput, 0) < -0.3,
    "A negative loud peak should pull the trace below its baseline.",
  );
  assert.ok(
    computeWaveformPoint(loudPositiveInput, 0) > 0.3,
    "A positive loud peak should pull the trace above its baseline.",
  );
  assert.equal(computeWaveformPoint(loudPositiveInput, 1), 1, "Positive points should clamp at one.");
  assert.equal(computeWaveformPoint(loudNegativeInput, -1), -1, "Negative points should clamp at minus one.");

  const history = new Float32Array(WAVEFORM_HISTORY_SIZE);
  history[history.length - 1] = 0.25;
  appendWaveformPoint(history, -1.5);
  assert.equal(history[history.length - 2], 0.25, "Waveform history should advance one position.");
  assert.equal(history[history.length - 1], -1, "Signed history values should clamp before drawing.");
  assert.equal(
    WAVEFORM_HISTORY_SIZE * WAVEFORM_SAMPLE_INTERVAL_MS,
    2_080,
    "The normal waveform should retain roughly two seconds of microphone history.",
  );
}

function verifyTranscriptionRules() {
  assert.equal(normalizeCaptureMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.doesNotThrow(() => validateCaptureAudioMetadata({ size: 1024, type: "audio/mp4" }));
  assert.doesNotThrow(() =>
    validateCaptureAudioMetadata({ size: MAX_CAPTURE_AUDIO_BYTES, type: "audio/ogg;codecs=opus" }),
  );
  expectTranscriptionError(
    () => validateCaptureAudioMetadata({ size: 0, type: "audio/webm" }),
    422,
  );
  expectTranscriptionError(
    () => validateCaptureAudioMetadata({ size: MAX_CAPTURE_AUDIO_BYTES + 1, type: "audio/webm" }),
    413,
  );
  expectTranscriptionError(
    () => validateCaptureAudioMetadata({ size: 1024, type: "audio/wav" }),
    415,
  );
  assert.equal(parseWhisperTranscript({ text: "  jab, cross, rear low kick  " }), "jab, cross, rear low kick");
  expectTranscriptionError(() => parseWhisperTranscript({ text: " " }), 422);
  expectTranscriptionError(() => parseWhisperTranscript({ result: "missing text" }), 502);
}

async function verifyTranscriptionProvider() {
  const audio = new File([new Uint8Array([1, 2, 3])], "capture.webm", {
    type: "audio/webm;codecs=opus",
  });
  const forwardedRequest: { body: FormData | null } = { body: null };
  const fetcher: typeof fetch = async (_input, init) => {
    forwardedRequest.body = init?.body instanceof FormData ? init.body : null;
    return new Response(JSON.stringify({ text: "  switch step, lead kick  " }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const transcript = await transcribeCaptureAudio(audio, {
    provider: "whisper-local",
    fetcher,
    serverUrl: "http://127.0.0.1:8080/inference",
  });
  assert.equal(transcript, "switch step, lead kick");
  assert.ok(forwardedRequest.body, "Whisper request should use multipart form data.");
  assert.equal(forwardedRequest.body.get("language"), "en");
  assert.equal(forwardedRequest.body.get("temperature"), "0");
  assert.match(String(forwardedRequest.body.get("prompt")), /Muay Thai/);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "whisper-local",
        signal: controller.signal,
        serverUrl: "http://127.0.0.1:8080/inference",
        fetcher: async (_input, init) => {
          if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
          return new Response(JSON.stringify({ text: "unexpected" }));
        },
      }),
    CaptureTranscriptionCancelledError,
  );

  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "whisper-local",
        serverUrl: "http://127.0.0.1:8080/inference",
        fetcher: async () => {
          throw new TypeError("connection refused");
        },
      }),
    (error: unknown) => error instanceof CaptureTranscriptionError && error.status === 503,
  );

  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "whisper-local",
        serverUrl: "http://127.0.0.1:8080/inference",
        fetcher: async () => {
          const timeout = new Error("timed out");
          timeout.name = "TimeoutError";
          throw timeout;
        },
      }),
    (error: unknown) => error instanceof CaptureTranscriptionError && error.status === 504,
  );

  const openAIRequest: {
    body: FormData | null;
    authorization: string | null;
    url: string;
  } = { body: null, authorization: null, url: "" };
  const openAITranscript = await transcribeCaptureAudio(audio, {
    provider: "openai",
    apiKey: "test-api-key",
    model: "gpt-4o-mini-transcribe",
    fetcher: async (input, init) => {
      openAIRequest.url = String(input);
      openAIRequest.body = init?.body instanceof FormData ? init.body : null;
      openAIRequest.authorization = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ text: "  jab, cross, low kick  " }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(openAITranscript, "jab, cross, low kick");
  assert.equal(openAIRequest.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(openAIRequest.authorization, "Bearer test-api-key");
  assert.ok(openAIRequest.body, "OpenAI request should use multipart form data.");
  assert.equal(openAIRequest.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(openAIRequest.body.get("language"), "en");
  assert.match(String(openAIRequest.body.get("prompt")), /Muay Thai/);

  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "openai",
        apiKey: "",
      }),
    (error: unknown) => error instanceof CaptureTranscriptionError && error.status === 503,
  );

  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "openai",
        apiKey: "test-api-key",
        fetcher: async () =>
          new Response(
            JSON.stringify({ error: { code: "rate_limit_exceeded", type: "requests" } }),
            { status: 429 },
          ),
      }),
    (error: unknown) =>
      error instanceof CaptureTranscriptionError &&
      error.status === 503 &&
      error.message.includes("rate limited"),
  );

  await assert.rejects(
    () =>
      transcribeCaptureAudio(audio, {
        provider: "openai",
        apiKey: "test-api-key",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              error: { code: "insufficient_quota", type: "insufficient_quota" },
            }),
            { status: 429 },
          ),
      }),
    (error: unknown) =>
      error instanceof CaptureTranscriptionError &&
      error.status === 503 &&
      error.message.includes("API credits"),
  );
}

function expectTranscriptionError(action: () => unknown, status: number) {
  assert.throws(
    action,
    (error: unknown) => error instanceof CaptureTranscriptionError && error.status === status,
  );
}
