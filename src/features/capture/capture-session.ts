export type CaptureCleanupIdentity = {
  requestId: number;
  sessionId: number;
};

// Cleanup results are valid only for the transcript revision that started them.
export function isCurrentCaptureCleanup(
  request: CaptureCleanupIdentity,
  activeRequestId: number | null,
  activeSessionId: number | null,
): boolean {
  return request.requestId === activeRequestId && request.sessionId === activeSessionId;
}
