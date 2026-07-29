export class FriendMutationError extends Error {
  readonly status: 400 | 404 | 409 | 429;

  constructor(message: string, status: 400 | 404 | 409 | 429) {
    super(message);
    this.name = "FriendMutationError";
    this.status = status;
  }
}
