import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./SignOutButton";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  discardWork: vi.fn(),
  hasWork: false,
  loadStarted: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/features/journal/JournalUploadProvider", () => ({
  useJournalUpload: () => ({
    discardWork: mocks.discardWork,
    hasWork: mocks.hasWork,
  }),
}));

vi.mock("@/lib/supabase/client", () => {
  mocks.loadStarted();
  return { createSupabaseBrowserClient: mocks.createClient };
});

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasWork = false;
    mocks.createClient.mockReturnValue({ auth: { signOut: mocks.signOut } });
    mocks.discardWork.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("loads Supabase only after journal work is confirmed and discarded", async () => {
    const discard = deferred<void>();
    const confirm = vi.spyOn(window, "confirm");
    const queryClient = new QueryClient();
    const clear = vi.spyOn(queryClient, "clear");
    const user = userEvent.setup();
    mocks.hasWork = true;
    mocks.discardWork.mockReturnValue(discard.promise);
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderButton(queryClient);

    expect(mocks.loadStarted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(mocks.discardWork).not.toHaveBeenCalled();
    expect(mocks.loadStarted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.discardWork).toHaveBeenCalledOnce();
    expect(mocks.loadStarted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Signing out..." })).toBeDisabled();

    await act(async () => discard.resolve());

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.loadStarted).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/auth/sign-in");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("stays signed in when the active journal upload cannot be discarded", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const queryClient = new QueryClient();
    const clear = vi.spyOn(queryClient, "clear");
    const user = userEvent.setup();
    mocks.hasWork = true;
    mocks.discardWork.mockRejectedValue(new Error("cleanup failed"));
    renderButton(queryClient);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not discard the active journal upload. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.loadStarted).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("reenables sign out and reports a returned Supabase error", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("offline") });
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const clear = vi.spyOn(queryClient, "clear");
    renderButton(queryClient);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not sign out. Check your connection and try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("reenables sign out when the Supabase request rejects", async () => {
    mocks.signOut.mockRejectedValue(new Error("network failed"));
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    renderButton(queryClient);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

function renderButton(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SignOutButton />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
