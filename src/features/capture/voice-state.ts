export type VoiceCaptureStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "finalizing"
  | "transcribing"
  | "recorded"
  | "error";

export type VoiceCancelTransition = {
  nextStatus: "idle" | "recorded";
  discardAudio: boolean;
  resetElapsed: boolean;
};

export type VoiceStopTransition = {
  nextStatus: "finalizing";
  elapsedMs: number;
};

export type VoiceFinalizationTimeoutTransition = {
  nextStatus: "recorded" | "error";
  retainAudio: boolean;
  message: string;
};

export type VoiceTranscriptionFailureTransition = {
  nextStatus: "recorded" | "error";
  retainAudio: boolean;
  message: string;
};

/** Keeps completed audio recoverable while making recording cancellation destructive. */
export function getVoiceCancelTransition(
  status: VoiceCaptureStatus,
  hasRecordedAudio: boolean,
): VoiceCancelTransition {
  if (status === "transcribing" && hasRecordedAudio) {
    return {
      nextStatus: "recorded",
      discardAudio: false,
      resetElapsed: false,
    };
  }

  return {
    nextStatus: "idle",
    discardAudio: true,
    resetElapsed: true,
  };
}

export function getVoiceStopTransition(elapsedMs: number, maxElapsedMs: number): VoiceStopTransition {
  return {
    nextStatus: "finalizing",
    elapsedMs: Math.max(0, Math.min(elapsedMs, maxElapsedMs)),
  };
}

export function getVoiceFinalizationTimeoutTransition(
  hasAudioChunks: boolean,
): VoiceFinalizationTimeoutTransition {
  if (hasAudioChunks) {
    return {
      nextStatus: "recorded",
      retainAudio: true,
      message: "Audio finalization took too long. The recording was kept for retry.",
    };
  }

  return {
    nextStatus: "error",
    retainAudio: false,
    message: "The browser could not finish the recording. Record the memo again.",
  };
}

export function isCurrentVoiceAttempt(
  attemptId: number,
  activeAttemptId: number,
  completedAttemptId: number | null,
): boolean {
  return attemptId === activeAttemptId && attemptId !== completedAttemptId;
}

export function getVoiceTranscriptionFailureTransition(
  hasRecordedAudio: boolean,
  message: string,
): VoiceTranscriptionFailureTransition {
  return {
    nextStatus: hasRecordedAudio ? "recorded" : "error",
    retainAudio: hasRecordedAudio,
    message,
  };
}

// MediaRecorder can emit `stop` immediately after `error`; only an intentional
// discard is allowed to settle back to idle.
export function shouldRecorderStopSetIdle(discarded: boolean, recordingFailed: boolean): boolean {
  return discarded && !recordingFailed;
}

export function hasUnsavedVoiceWork(status: VoiceCaptureStatus, hasRecordedAudio: boolean): boolean {
  return (
    status === "recording" ||
    status === "finalizing" ||
    status === "transcribing" ||
    status === "recorded" ||
    (status === "error" && hasRecordedAudio)
  );
}
