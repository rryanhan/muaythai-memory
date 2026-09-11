export class JournalApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "JournalApiError";
    this.status = status;
  }
}
