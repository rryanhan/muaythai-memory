import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteDrillSection } from "./DeleteDrillSection";

const mocks = vi.hoisted(() => ({
  deleteDrill: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/data/drills", () => ({
  deleteDrill: mocks.deleteDrill,
}));

describe("DeleteDrillSection mutation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cannot open while the edit save is pending", () => {
    renderDelete(<DeleteDrillSection drillId={drillId} drillTitle="Rear kick" disabled />);

    expect(screen.getByRole("button", { name: "Delete Drill" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports pending synchronously, locks the drawer, and delegates one successful navigation", async () => {
    const deletion = deferred<string>();
    mocks.deleteDrill.mockReturnValueOnce(deletion.promise);
    const onPendingChange = vi.fn();
    const onDeleted = vi.fn();
    renderDelete(
      <DeleteDrillSection
        drillId={drillId}
        drillTitle="Rear kick"
        onPendingChange={onPendingChange}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Rear kick?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete Drill" });
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(onPendingChange).toHaveBeenCalledTimes(1);
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Keep Drill" })).toBeDisabled();
    await waitFor(() => expect(mocks.deleteDrill).toHaveBeenCalledTimes(1));

    await act(async () => {
      deletion.resolve(drillId);
      await deletion.promise;
    });

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(drillId));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("re-enables deletion and reports settled after a recoverable error", async () => {
    const deletion = deferred<string>();
    mocks.deleteDrill.mockReturnValueOnce(deletion.promise);
    const onPendingChange = vi.fn();
    renderDelete(
      <DeleteDrillSection
        drillId={drillId}
        drillTitle="Rear kick"
        onPendingChange={onPendingChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Rear kick?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Drill" }));
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      deletion.reject(new Error("Delete service unavailable."));
      await Promise.resolve();
    });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The drill could not be deleted. Try again.",
    );
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
    expect(within(dialog).getByRole("button", { name: "Delete Drill" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Keep Drill" })).toBeEnabled();
  });

  it("does not navigate or notify a stale parent when deletion settles after unmount", async () => {
    const deletion = deferred<string>();
    mocks.deleteDrill.mockReturnValueOnce(deletion.promise);
    const onPendingChange = vi.fn();
    const onDeleted = vi.fn();
    const { queryClient, unmount } = renderDelete(
      <DeleteDrillSection
        drillId={drillId}
        drillTitle="Rear kick"
        onPendingChange={onPendingChange}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Rear kick?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Drill" }));
    expect(onPendingChange).toHaveBeenCalledWith(true);

    unmount();
    await act(async () => {
      deletion.resolve(drillId);
      await deletion.promise;
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(onDeleted).not.toHaveBeenCalled();
    expect(onPendingChange).not.toHaveBeenCalledWith(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

const drillId = "00000000-0000-4000-8000-000000000701";

function renderDelete(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      {element}
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
