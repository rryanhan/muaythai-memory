import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./SignInForm";

const authMocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: authMocks }),
}));

describe("SignInForm", () => {
  beforeEach(() => {
    authMocks.signInWithOAuth.mockReset();
    authMocks.signInWithPassword.mockReset();
    authMocks.signUp.mockReset();
  });

  it("freezes and announces the normalized account-confirmation address", async () => {
    authMocks.signUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const user = userEvent.setup();
    render(<SignInForm nextPath="/?view=library" />);

    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await user.type(screen.getByLabelText("Email"), "Fighter@Example.com");
    await user.type(screen.getByLabelText("Password"), "new-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const heading = await screen.findByRole("heading", { name: "Check your email" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Confirm fighter@example.com once/)).toBeInTheDocument();
    expect(authMocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "fighter@example.com",
      password: "new-password",
    }));
  });

  it("moves focus to an initial callback error", async () => {
    render(<SignInForm nextPath="/" initialError="That link has expired." />);

    const error = screen.getByRole("alert");
    await waitFor(() => expect(error).toHaveFocus());
  });

  it("announces a completed password reset and focuses the success message", async () => {
    render(
      <SignInForm
        nextPath="/?view=profile"
        initialSuccess="Password updated. Sign in with your new password."
      />,
    );

    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveFocus());
    expect(status).toHaveTextContent("Password updated");
  });
});
