import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SignOutButton } from "./SignOutButton";

const mocks = vi.hoisted(() => ({
  loadStarted: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/features/journal/JournalUploadProvider", () => ({
  useJournalUpload: () => ({
    discardWork: vi.fn(),
    hasWork: false,
  }),
}));

vi.mock("@/lib/supabase/client", () => {
  mocks.loadStarted();
  throw new Error("chunk failed");
});

it("reenables sign out and reports an SDK loading failure", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SignOutButton />
    </QueryClientProvider>,
  );

  expect(mocks.loadStarted).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Sign out" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not sign out. Check your connection and try again.",
  );
  expect(mocks.loadStarted).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
