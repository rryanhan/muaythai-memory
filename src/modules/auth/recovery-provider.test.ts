import { describe, expect, it } from "vitest";
import { classifyRecoveryPasswordUpdate } from "./recovery-provider";

describe("classifyRecoveryPasswordUpdate", () => {
  it("treats an already-applied same password as idempotent success", () => {
    expect(classifyRecoveryPasswordUpdate({
      code: "same_password",
      status: 422,
    })).toEqual({ ok: true });
  });

  it("distinguishes conclusive provider rejection from ambiguous outcomes", () => {
    expect(classifyRecoveryPasswordUpdate({
      code: "weak_password",
      status: 422,
    })).toEqual({ certainty: "known", ok: false });
    expect(classifyRecoveryPasswordUpdate({
      code: "unexpected_failure",
      status: 500,
    })).toEqual({ certainty: "ambiguous", ok: false });
    expect(classifyRecoveryPasswordUpdate({
      code: "request_timeout",
      status: 408,
    })).toEqual({ certainty: "ambiguous", ok: false });
  });
});
