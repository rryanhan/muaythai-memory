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
