import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDrillForm } from "./AddDrillForm";

const mocks = vi.hoisted(() => ({
  createDrill: vi.fn(),
  getTaxonomy: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  updateDrill: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/data/drills", () => ({
  createDrill: mocks.createDrill,
  updateDrill: mocks.updateDrill,
}));
vi.mock("@/data/taxonomy", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

describe("AddDrillForm creation commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaxonomy.mockResolvedValue({
      customTags: [],
      standardTags: [],
      statusTags: [],
      tagCategories: [],
      trainingMethods: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          name: "Pad Work",
          slug: "pad-work",
          iconKey: "pad-work",
          sortOrder: 1,
        },
      ],
    });
  });

  it("locks Cancel during Save and focuses a recoverable request error", async () => {
    let rejectCreate: ((error: Error) => void) | undefined;
    const createAction = vi.fn(
      () => new Promise<never>((_resolve, reject) => {
        rejectCreate = reject;
      }),
    );
    const onCommitChange = vi.fn();
    const user = userEvent.setup();
    renderForm(
      <AddDrillForm
        createAction={createAction}
        onCreationCommitChange={onCommitChange}
      />,
    );

    await user.type(await screen.findByLabelText("Title"), "Slip and return");
    await user.type(screen.getByPlaceholderText("Start with..."), "Slip outside.");
    await user.click(screen.getByRole("button", { name: "Pad Work" }));
    await user.click(screen.getByRole("button", { name: "Save drill" }));

    expect(onCommitChange).toHaveBeenCalledWith(true);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
    expect(cancel.closest("form")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      rejectCreate?.(new Error("Connection interrupted."));
    });

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(onCommitChange).toHaveBeenLastCalledWith(false);
  });
});

function renderForm(form: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {form}
    </QueryClientProvider>,
  );
}
