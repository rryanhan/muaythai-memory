import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SignInForm } from "./SignInForm";

const clientModule = vi.hoisted(() => ({ loadStarted: vi.fn() }));

vi.mock("@/lib/supabase/client", () => {
  clientModule.loadStarted();
  throw new Error("The authentication chunk could not be loaded.");
});

it("recovers when the authentication client cannot be loaded", async () => {
  const user = userEvent.setup();
  render(<SignInForm nextPath="/" />);

  expect(clientModule.loadStarted).not.toHaveBeenCalled();

  await user.type(screen.getByLabelText("Email"), "fighter@example.com");
  await user.type(screen.getByLabelText("Password"), "valid-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Authentication is temporarily unavailable. Refresh and try again.",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(clientModule.loadStarted).toHaveBeenCalledOnce();
});
