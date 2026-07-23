import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

describe("ForgotPasswordForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("freezes the submitted address and focuses the success state", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      finishRequest = resolve;
    })));
    const user = userEvent.setup();
    render(<ForgotPasswordForm nextPath="/drills" />);

    const emailInput = screen.getByLabelText("Email");
    await user.type(emailInput, " Fighter@Example.com ");
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));

    expect(emailInput).toBeDisabled();
    await user.type(emailInput, "other@example.com");
    expect(emailInput).toHaveValue("Fighter@Example.com");

    finishRequest?.(new Response(JSON.stringify({ sent: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));

    const heading = await screen.findByRole("heading", { name: "Check your email" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("fighter@example.com");
  });

  it("keeps a failed request recoverable and focuses its error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Too many attempts were made. Wait a while before trying again." }),
      { headers: { "content-type": "application/json" }, status: 429 },
    )));
    const user = userEvent.setup();
    render(<ForgotPasswordForm nextPath="/" />);

    await user.type(screen.getByLabelText("Email"), "fighter@example.com");
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));

    const error = await screen.findByRole("alert");
    await waitFor(() => expect(error).toHaveFocus());
    expect(screen.getByLabelText("Email")).not.toBeDisabled();
  });
});
