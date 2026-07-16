"use client";

import { Keyboard } from "@phosphor-icons/react/Keyboard";
import { Microphone } from "@phosphor-icons/react/Microphone";
import { Stop } from "@phosphor-icons/react/Stop";
import { X } from "@phosphor-icons/react/X";
import { useEffect, useRef, useState } from "react";
import type { ApiError } from "@/data/api-core";
import { transcribeCaptureRecording } from "@/data/capture";
import {
  CAPTURE_CLIENT_TRANSCRIPTION_TIMEOUT_MS,
  CAPTURE_FINALIZATION_TIMEOUT_MS,
  chooseCaptureMimeType,
  formatRecordingDuration,
  MAX_VOICE_MEMO_MS,
} from "./recorder";
import styles from "./Capture.module.css";
import {
  getVoiceCancelTransition,
  getVoiceFinalizationTimeoutTransition,
  getVoiceStopTransition,
  getVoiceTranscriptionFailureTransition,
  hasUnsavedVoiceWork,
  isCurrentVoiceAttempt,
  shouldRecorderStopSetIdle,
  type VoiceCaptureStatus,
} from "./voice-state";
import { VoiceWaveform } from "./VoiceWaveform";

type VoiceCapturePanelProps = {
  onTranscript: (transcript: string) => void;
  onUseText: () => void;
  onStateChange?: (state: VoiceCaptureState) => void;
};

export type VoiceCaptureState = {
  status: VoiceCaptureStatus;
  hasUnsavedWork: boolean;
};

// Recorder lifecycle stays inside this deferred phase so idle text capture and
// drill review do not compile browser audio APIs they cannot use.
export function VoiceCapturePanel({
  onTranscript,
  onUseText,
  onStateChange,
}: VoiceCapturePanelProps) {
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordedNotice, setRecordedNotice] = useState<string | null>(null);
  const [waveformStream, setWaveformStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const transcriptionAbortReasonRef = useRef<"user" | "timeout" | null>(null);
  const transcriptionAttemptRef = useRef(0);
  const transcriptionTimeoutRef = useRef<number | null>(null);
  const finalizationTimeoutRef = useRef<number | null>(null);
  const finalizedRecordingAttemptRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const recordingFailureRef = useRef(false);
  const recordingAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingAttemptRef.current += 1;
      transcriptionAttemptRef.current += 1;
      transcriptionAbortReasonRef.current = "user";
      transcriptionAbortRef.current?.abort();
      discardRecordingRef.current = true;
      clearFinalizationTimeout();
      clearTranscriptionTimeout();
      stopTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopStream();
    };
  }, []);

  useEffect(() => {
    onStateChange?.({
      status,
      hasUnsavedWork: hasUnsavedVoiceWork(status, Boolean(recordedBlobRef.current)),
    });
  }, [onStateChange, status]);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearFinalizationTimeout() {
    if (finalizationTimeoutRef.current !== null) {
      window.clearTimeout(finalizationTimeoutRef.current);
      finalizationTimeoutRef.current = null;
    }
  }

  function clearTranscriptionTimeout() {
    if (transcriptionTimeoutRef.current !== null) {
      window.clearTimeout(transcriptionTimeoutRef.current);
      transcriptionTimeoutRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (mountedRef.current) setWaveformStream(null);
  }

  function finishRecording(discard: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRecordingRef.current = discard;
    recordingFailureRef.current = false;
    stopTimer();
    if (discard) {
      clearFinalizationTimeout();
      recordedBlobRef.current = null;
      setRecordedNotice(null);
      setElapsedMs(0);
      setErrorMessage(null);
      setStatus("idle");
    } else {
      const transition = getVoiceStopTransition(
        Date.now() - recordingStartedAtRef.current,
        MAX_VOICE_MEMO_MS,
      );
      setElapsedMs(transition.elapsedMs);
      setStatus(transition.nextStatus);
      setRecordedNotice(null);

      const attemptId = recordingAttemptRef.current;
      const recorderMimeType = recorder.mimeType || "audio/webm";
      clearFinalizationTimeout();
      finalizationTimeoutRef.current = window.setTimeout(() => {
        handleFinalizationTimeout(attemptId, recorderMimeType);
      }, CAPTURE_FINALIZATION_TIMEOUT_MS);

      try {
        recorder.requestData();
      } catch {
        // Some browsers do not support flushing a recorder immediately before stop.
      }
    }
    try {
      recorder.stop();
    } catch {
      if (!discard) handleFinalizationTimeout(recordingAttemptRef.current, recorder.mimeType);
    }
    stopStream();
  }

  function handleFinalizationTimeout(attemptId: number, mimeType: string) {
    if (
      !mountedRef.current ||
      !isCurrentVoiceAttempt(
        attemptId,
        recordingAttemptRef.current,
        finalizedRecordingAttemptRef.current,
      )
    ) {
      return;
    }

    clearFinalizationTimeout();
    finalizedRecordingAttemptRef.current = attemptId;
    discardRecordingRef.current = true;
    recorderRef.current = null;
    stopStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    const transition = getVoiceFinalizationTimeoutTransition(chunks.length > 0);
    if (transition.retainAudio) {
      const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
      if (blob.size > 0) {
        recordedBlobRef.current = blob;
        setRecordedNotice(transition.message);
        setErrorMessage(null);
        setStatus(transition.nextStatus);
        return;
      }
    }

    recordedBlobRef.current = null;
    setRecordedNotice(null);
    setStatus("error");
    setErrorMessage(transition.message);
  }

  async function startRecording() {
    const recordingAttempt = recordingAttemptRef.current + 1;
    recordingAttemptRef.current = recordingAttempt;
    finalizedRecordingAttemptRef.current = null;
    transcriptionAttemptRef.current += 1;
    transcriptionAbortReasonRef.current = "user";
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    clearFinalizationTimeout();
    clearTranscriptionTimeout();
    stopTimer();
    stopStream();
    recordedBlobRef.current = null;
    recordingFailureRef.current = false;
    setRecordedNotice(null);
    setErrorMessage(null);
    setElapsedMs(0);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setErrorMessage("Microphone recording needs a supported browser on localhost or HTTPS.");
      return;
    }

    setStatus("requesting");
    let requestedStream: MediaStream | null = null;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (!mountedRef.current || recordingAttempt !== recordingAttemptRef.current) {
        requestedStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const stream = requestedStream;
      streamRef.current = stream;
      setWaveformStream(stream);
      const mimeType = chooseCaptureMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96_000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRecordingRef.current = false;

      recorder.addEventListener("dataavailable", (event) => {
        if (
          event.data.size > 0 &&
          isCurrentVoiceAttempt(
            recordingAttempt,
            recordingAttemptRef.current,
            finalizedRecordingAttemptRef.current,
          )
        ) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        // Some browsers emit both error and stop. Mark this recording as
        // discarded so the stop handler cannot transcribe partial audio.
        discardRecordingRef.current = true;
        recordingFailureRef.current = true;
        finalizedRecordingAttemptRef.current = recordingAttempt;
        clearFinalizationTimeout();
        stopTimer();
        stopStream();
        if (!mountedRef.current) return;
        setStatus("error");
        setErrorMessage("The browser could not continue recording. Try again.");
      });
      recorder.addEventListener("stop", () => {
        clearFinalizationTimeout();
        recorderRef.current = null;
        if (
          !isCurrentVoiceAttempt(
            recordingAttempt,
            recordingAttemptRef.current,
            finalizedRecordingAttemptRef.current,
          )
        ) {
          chunksRef.current = [];
          return;
        }
        finalizedRecordingAttemptRef.current = recordingAttempt;
        const discarded = discardRecordingRef.current;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!mountedRef.current || discarded) {
          if (
            mountedRef.current &&
            shouldRecorderStopSetIdle(discarded, recordingFailureRef.current)
          ) {
            setStatus("idle");
          }
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size === 0) {
          recordedBlobRef.current = null;
          setStatus("error");
          setErrorMessage("The recording did not contain any audio.");
          return;
        }
        recordedBlobRef.current = blob;
        void beginTranscription(blob);
      });

      recorder.start(1000);
      recordingStartedAtRef.current = Date.now();
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const nextElapsed = Date.now() - recordingStartedAtRef.current;
        setElapsedMs(Math.min(nextElapsed, MAX_VOICE_MEMO_MS));
        if (nextElapsed >= MAX_VOICE_MEMO_MS) finishRecording(false);
      }, 250);
    } catch (error) {
      requestedStream?.getTracks().forEach((track) => track.stop());
      if (!mountedRef.current || recordingAttempt !== recordingAttemptRef.current) return;
      stopStream();
      setStatus("error");
      setErrorMessage(getMicrophoneErrorMessage(error));
    }
  }
  async function beginTranscription(blob: Blob) {
    if (blob.size === 0) {
      setStatus("error");
      setErrorMessage("The recording did not contain any audio.");
      return;
    }

    const transcriptionAttempt = transcriptionAttemptRef.current + 1;
    transcriptionAttemptRef.current = transcriptionAttempt;
    const controller = new AbortController();
    transcriptionAbortReasonRef.current = "user";
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = controller;
    transcriptionAbortReasonRef.current = null;
    clearTranscriptionTimeout();
    transcriptionTimeoutRef.current = window.setTimeout(() => {
      if (transcriptionAttempt !== transcriptionAttemptRef.current) return;
      transcriptionAbortReasonRef.current = "timeout";
      controller.abort();
    }, CAPTURE_CLIENT_TRANSCRIPTION_TIMEOUT_MS);
    setStatus("transcribing");
    setErrorMessage(null);
    setRecordedNotice(null);

    try {
      const response = await transcribeCaptureRecording(blob, {
        requestInit: { signal: controller.signal },
      });
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        transcriptionAttempt !== transcriptionAttemptRef.current
      ) {
        return;
      }
      clearTranscriptionTimeout();
      transcriptionAbortRef.current = null;
      onTranscript(response.transcript);
    } catch (error) {
      if (!mountedRef.current || transcriptionAttempt !== transcriptionAttemptRef.current) return;
      const abortReason = transcriptionAbortReasonRef.current;
      clearTranscriptionTimeout();
      transcriptionAbortRef.current = null;
      transcriptionAbortReasonRef.current = null;
      if (abortReason === "user") return;

      const message = abortReason === "timeout"
        ? "Transcription took too long. The recording was kept for retry."
        : isAbortError(error)
          ? "Transcription stopped unexpectedly. The recording was kept for retry."
          : getTranscriptionErrorMessage(error);
      const transition = getVoiceTranscriptionFailureTransition(
        Boolean(recordedBlobRef.current),
        message,
      );
      setStatus(transition.nextStatus);
      setRecordedNotice(transition.retainAudio ? transition.message : null);
      setErrorMessage(transition.retainAudio ? null : transition.message);
    }
  }

  function cancelRecording() {
    recordingAttemptRef.current += 1;
    transcriptionAttemptRef.current += 1;
    transcriptionAbortReasonRef.current = "user";
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    clearTranscriptionTimeout();
    const transition = getVoiceCancelTransition(status, Boolean(recordedBlobRef.current));

    if (status === "recording") {
      finishRecording(true);
      return;
    }

    if (status === "finalizing") {
      clearFinalizationTimeout();
      discardRecordingRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The recorder may already be stopping.
        }
      }
      recorderRef.current = null;
      chunksRef.current = [];
    }

    if (!transition.discardAudio) {
      setStatus(transition.nextStatus);
      setErrorMessage(null);
      setRecordedNotice("Transcription cancelled. The recording was kept.");
      return;
    }

    stopTimer();
    stopStream();
    recordedBlobRef.current = null;
    recordingFailureRef.current = false;
    setRecordedNotice(null);
    setStatus(transition.nextStatus);
    if (transition.resetElapsed) setElapsedMs(0);
    setErrorMessage(null);
  }

  function discardRecordedMemo() {
    transcriptionAttemptRef.current += 1;
    transcriptionAbortReasonRef.current = "user";
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    clearTranscriptionTimeout();
    clearFinalizationTimeout();
    recordedBlobRef.current = null;
    recordingFailureRef.current = false;
    setRecordedNotice(null);
    setElapsedMs(0);
    setErrorMessage(null);
    setStatus("idle");
  }

  function retryTranscription() {
    const blob = recordedBlobRef.current;
    if (blob) void beginTranscription(blob);
  }

  const statusLabel = {
    idle: "READY",
    requesting: "REQUESTING",
    recording: "REC",
    finalizing: "FINALIZING",
    transcribing: "TRANSCRIBING",
    recorded: "RECORDED",
    error: "ERROR",
  }[status];

  const statusMessage = {
    idle: "Ready for a training note",
    requesting: "Allow microphone access to begin",
    recording: "Listening for your drill note",
    finalizing: "Preparing the recorded audio",
    transcribing: "Processing the recording locally",
    recorded: recordedNotice ?? "Recording kept for this session",
    error: errorMessage ?? "Recording could not continue",
  }[status];

  return (
    <section className={styles.voicePanel} aria-live="polite">
      <p className="eyebrow">Voice Memo</p>

      <div className={styles.voiceStage} data-status={status}>
        <div className={styles.voiceConsoleHeader}>
          <span>MIC INPUT</span>
          <span className={styles.voiceConsoleState} data-status={status}>
            {statusLabel}
          </span>
        </div>
        <div className={styles.voiceConsoleDisplay}>
          <p className={styles.voiceTimer}>{formatRecordingDuration(elapsedMs)}</p>
          <div className={styles.voiceWaveformViewport}>
            <VoiceWaveform active={status === "recording"} stream={waveformStream} />
          </div>
          <div className={styles.voiceConsoleMessage}>
            <p>{statusMessage}</p>
            {status === "recorded" && (
              <button type="button" onClick={() => void startRecording()}>
                Record again
              </button>
            )}
            {status === "error" && recordedBlobRef.current && (
              <button type="button" onClick={() => void startRecording()}>
                Discard and record again
              </button>
            )}
          </div>
        </div>
        <div className={styles.voiceCommandRail} data-status={status}>
          {(status === "idle" || status === "error") && (
            <button type="button" className={styles.voiceSecondaryCommand} onClick={onUseText}>
              <Keyboard size={19} weight="regular" />
              Type instead
            </button>
          )}
          {(status === "requesting" ||
            status === "recording" ||
            status === "finalizing" ||
            status === "transcribing") && (
            <button type="button" className={styles.voiceSecondaryCommand} onClick={cancelRecording}>
              <X size={18} weight="bold" />
              Cancel
            </button>
          )}
          {status === "recorded" && (
            <button type="button" className={styles.voiceSecondaryCommand} onClick={discardRecordedMemo}>
              <X size={18} weight="bold" />
              Discard
            </button>
          )}

          {status === "idle" && (
            <button
              type="button"
              className={styles.voicePrimaryCommand}
              onClick={() => void startRecording()}
            >
              <Microphone size={21} weight="regular" />
              Start recording
            </button>
          )}
          {status === "recording" && (
            <button
              type="button"
              className={styles.voicePrimaryCommand}
              onClick={() => finishRecording(false)}
            >
              <Stop size={19} weight="fill" />
              Stop &amp; transcribe
            </button>
          )}
          {status === "requesting" && (
            <button type="button" className={styles.voiceProgressCommand} disabled>
              <Microphone size={20} weight="regular" />
              Requesting access
            </button>
          )}
          {status === "finalizing" && (
            <button type="button" className={styles.voiceProgressCommand} disabled>
              Finalizing audio
            </button>
          )}
          {status === "transcribing" && (
            <button type="button" className={styles.voiceProgressCommand} disabled>
              Transcribing locally
            </button>
          )}
          {status === "recorded" && (
            <button type="button" className={styles.voicePrimaryCommand} onClick={retryTranscription}>
              Transcribe recording
            </button>
          )}
          {status === "error" && recordedBlobRef.current && (
            <button type="button" className={styles.voicePrimaryCommand} onClick={retryTranscription}>
              Retry transcription
            </button>
          )}
          {status === "error" && !recordedBlobRef.current && (
            <button
              type="button"
              className={styles.voicePrimaryCommand}
              onClick={() => void startRecording()}
            >
              <Microphone size={20} weight="regular" />
              Record again
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function getMicrophoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Microphone access was denied. Allow access or type the note instead.";
    if (error.name === "NotFoundError") return "No microphone was found on this device.";
    if (error.name === "NotReadableError") return "The microphone is busy in another app.";
  }
  return "The microphone could not be started. Try again or type the note instead.";
}

function getTranscriptionErrorMessage(error: unknown): string {
  const responseBody = (error as ApiError | undefined)?.responseBody;
  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    const setup = "setup" in responseBody ? ` ${String(responseBody.setup)}` : "";
    return `${String(responseBody.error)}${setup}`;
  }
  return "The recording could not be transcribed. Retry or record it again.";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}
