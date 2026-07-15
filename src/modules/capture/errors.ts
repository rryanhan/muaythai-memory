export class CaptureDraftConfigError extends Error {
  readonly setup?: string;

  constructor(message = "Capture is not configured.", setup?: string) {
    super(message);
    this.name = "CaptureDraftConfigError";
    this.setup = setup;
  }
}

export class CaptureDraftGenerationError extends Error {
  constructor(message = "Couldn’t generate a draft.") {
    super(message);
    this.name = "CaptureDraftGenerationError";
  }
}

export class CaptureDraftCancelledError extends Error {
  constructor() {
    super("Capture cleanup was cancelled.");
    this.name = "CaptureDraftCancelledError";
  }
}

export class CaptureTranscriptionError extends Error {
  readonly status: 413 | 415 | 422 | 502 | 503 | 504;
  readonly setup?: string;

  constructor(
    message: string,
    status: 413 | 415 | 422 | 502 | 503 | 504,
    setup?: string,
  ) {
    super(message);
    this.name = "CaptureTranscriptionError";
    this.status = status;
    this.setup = setup;
  }
}

export class CaptureTranscriptionCancelledError extends Error {
  constructor() {
    super("Transcription was cancelled.");
    this.name = "CaptureTranscriptionCancelledError";
  }
}
