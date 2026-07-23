import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./ResetPasswordForm";

describe("ResetPasswordForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts through the server handler and announces completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        redirectTo: "/auth/sign-in?reason=password-reset&next=%2F%3Fview%3Dprofile",
        updated: true,
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <ResetPasswordForm
        grantId="rendered-grant-id"
        nextPath="/?view=profile"
        onComplete={onComplete}
      />,
    );

    const passwordFields = screen.getAllByLabelText(/password/i, { selector: "input" });
    await user.type(passwordFields[0], "new-password");
    await user.type(passwordFields[1], "new-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveFocus();
    expect(status).toHaveTextContent("Password updated");
    expect(onComplete).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/recovery/reset",
      expect.objectContaining({
        body: JSON.stringify({
          grantId: "rendered-grant-id",
          next: "/?view=profile",
          password: "new-password",
        }),
        method: "POST",
      }),
    );
  });
});
