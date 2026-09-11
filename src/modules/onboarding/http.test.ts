import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateOnboardingState: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({
  invalidateOnboardingState: mocks.invalidateOnboardingState,
}));

import { finalizeOnboardingMutationResponse } from "./http";

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.invalidateOnboardingState.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("finalizeOnboardingMutationResponse", () => {
  it("does not invalidate before a mutation is attempted", () => {
    const response = NextResponse.json({ error: "Invalid input." }, { status: 400 });

    const result = finalize({ attempted: false, succeeded: false, response });

    expect(result).toBe(response);
    expect(mocks.invalidateOnboardingState).not.toHaveBeenCalled();
  });

  it("invalidates an attempted mutation and preserves its response", () => {
    const response = NextResponse.json({ saved: true });

    const result = finalize({ response });

    expect(result).toBe(response);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledOnce();
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it.each([
    { label: "failed mutation", succeeded: false, status: 500 },
    { label: "failed response after a commit", succeeded: true, status: 400 },
  ])("preserves a $label response when invalidation also fails", ({ succeeded, status }) => {
    const response = NextResponse.json({ error: "Original failure." }, { status });
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("Cache unavailable.");
    });

    const result = finalize({ succeeded, response });

    expect(result).toBe(response);
  });

  it("returns a retryable error when a successful mutation cannot be invalidated", async () => {
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("Cache unavailable.");
    });

    const result = finalize({ response: NextResponse.json({ saved: true }) });

    expect(result.status).toBe(503);
    expect(result.headers.get("retry-after")).toBe("1");
    await expect(result.json()).resolves.toEqual({
      error: "Saved, but onboarding could not be refreshed.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Onboarding invalidation failed.",
      "Cache unavailable.",
    );
  });
});

function finalize({
  attempted = true,
  succeeded = true,
  response,
}: {
  attempted?: boolean;
  succeeded?: boolean;
  response: NextResponse;
}) {
  return finalizeOnboardingMutationResponse({
    userId,
    attempted,
    succeeded,
    response,
    invalidationLogMessage: "Onboarding invalidation failed.",
    retryMessage: "Saved, but onboarding could not be refreshed.",
  });
}
