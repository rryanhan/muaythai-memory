export class ConnectionMutationError extends Error {
  readonly status: 400 | 404 | 409 | 429;

  constructor(message: string, status: 400 | 404 | 409 | 429) {
    super(message);
    this.name = "ConnectionMutationError";
    this.status = status;
  }
}
