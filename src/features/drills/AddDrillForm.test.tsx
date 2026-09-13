import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DRILL_LIMITS } from "@/config/domain-limits";
import type { DrillDetail, TaxonomyResponse } from "@/data/types";
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
vi.mock("@/data/taxonomy", () => ({ getTaxonomy: mocks.getTaxonomy }));
vi.mock("@/data/drills", () => ({
  createDrill: mocks.createDrill,
  updateDrill: mocks.updateDrill,
}));

const taxonomyFixture: TaxonomyResponse = {
  customTags: [
    {
      id: "00000000-0000-4000-8000-000000000305",
      name: "Wall Work",
      slug: "wall-work",
      kind: "custom",
      sortOrder: 1,
      category: null,
    },
  ],
  standardTags: [
    {
      id: "00000000-0000-4000-8000-000000000304",
      name: "Clinch Entry",
      slug: "clinch-entry",
      kind: "standard",
      sortOrder: 1,
      category: {
        id: "00000000-0000-4000-8000-000000000303",
        name: "Clinch",
        slug: "clinch",
      },
    },
  ],
  statusTags: [
    {
      id: "00000000-0000-4000-8000-000000000306",
      name: "Starred",
      slug: "starred",
      sortOrder: 1,
    },
  ],
  tagCategories: [
    {
      id: "00000000-0000-4000-8000-000000000303",
      name: "Clinch",
      slug: "clinch",
      sortOrder: 1,
      tags: [
        {
          id: "00000000-0000-4000-8000-000000000304",
          name: "Clinch Entry",
          slug: "clinch-entry",
          kind: "standard",
          sortOrder: 1,
          category: {
            id: "00000000-0000-4000-8000-000000000303",
            name: "Clinch",
            slug: "clinch",
          },
        },
      ],
    },
  ],
  trainingMethods: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      name: "Pad Work",
      slug: "pad-work",
      iconKey: "pad-work",
      sortOrder: 1,
    },
  ],
};

const savedDrillFixture: DrillDetail = {
  id: "00000000-0000-4000-8000-000000000401",
  title: "Slip and return",
  summary: "",
  notes: null,
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000402",
      position: 1,
      body: "Slip outside.",
    },
  ],
  trainingMethods: taxonomyFixture.trainingMethods,
  tags: [],
  customTags: [],
  statusTags: [],
  createdAt: new Date("2026-09-13T12:00:00Z"),
  updatedAt: new Date("2026-09-13T12:00:00Z"),
};

describe("AddDrillForm creation commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaxonomy.mockResolvedValue(taxonomyFixture);
  });

  it("renders server-provided taxonomy immediately without a client request", async () => {
    renderForm(<AddDrillForm initialTaxonomy={taxonomyFixture} />);

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pad Work" })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
  });

  it("locks every form action during Save and focuses a recoverable request error", async () => {
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
        cleanupState={{
          status: "error",
          errorMessage: "Cleanup paused.",
          onRetry: vi.fn(),
        }}
        onCreationCommitChange={onCommitChange}
      />,
    );

    await user.type(await screen.findByLabelText("Title"), "Slip and return");
    await user.type(screen.getByPlaceholderText("Start with..."), "Slip outside.");
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.type(screen.getByPlaceholderText("Next step"), "Return with the cross.");
    await user.click(screen.getByRole("button", { name: "Favourite" }));
    await user.click(screen.getByRole("button", { name: "Pad Work" }));
    await user.click(screen.getByRole("button", { name: "Clinch Entry" }));
    await user.click(screen.getByRole("button", { name: "Wall Work" }));
    await user.click(screen.getByRole("button", { name: "Save drill" }));

    expect(onCommitChange).toHaveBeenCalledWith(true);
    const form = screen.getByRole("button", { name: "Cancel" }).closest("form");
    expect(form).toHaveAttribute("aria-busy", "true");
    for (const control of form?.querySelectorAll("input, textarea, button") ?? []) {
      expect(control).toBeDisabled();
    }

    await act(async () => {
      rejectCreate?.(new Error("Connection interrupted."));
    });

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(onCommitChange).toHaveBeenLastCalledWith(false);
  });

  it("submits only once when two submit events arrive before React can rerender", async () => {
    const create = deferred<never>();
    const createAction = vi.fn(() => create.promise);
    const onCommitChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderForm(
      <AddDrillForm
        createAction={createAction}
        onCreationCommitChange={onCommitChange}
      />,
    );

    await user.type(await screen.findByLabelText("Title"), "Slip and return");
    await user.type(screen.getByPlaceholderText("Start with..."), "Slip outside.");
    await user.click(screen.getByRole("button", { name: "Pad Work" }));
    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(onCommitChange).toHaveBeenCalledTimes(1);
    expect(onCommitChange).toHaveBeenCalledWith(true);
  });

  it("does not run stale UI callbacks when a save settles after unmount", async () => {
    const create = deferred<DrillDetail>();
    const createAction = vi.fn(() => create.promise);
    const onCommitChange = vi.fn();
    const onDirtyChange = vi.fn();
    const onSaveSuccess = vi.fn();
    const user = userEvent.setup();
    const { queryClient, unmount } = renderForm(
      <AddDrillForm
        createAction={createAction}
        onCreationCommitChange={onCommitChange}
        onDirtyChange={onDirtyChange}
        onSaveSuccess={onSaveSuccess}
      />,
    );

    await user.type(await screen.findByLabelText("Title"), "Slip and return");
    await user.type(screen.getByPlaceholderText("Start with..."), "Slip outside.");
    await user.click(screen.getByRole("button", { name: "Pad Work" }));
    await user.click(screen.getByRole("button", { name: "Save drill" }));
    expect(onCommitChange).toHaveBeenLastCalledWith(true);

    unmount();
    await act(async () => {
      create.resolve(savedDrillFixture);
      await create.promise;
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
    expect(onCommitChange).not.toHaveBeenCalledWith(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("AddDrillForm input limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTaxonomy.mockResolvedValue({
      trainingMethods: [],
      tagCategories: [],
      standardTags: [],
      customTags: [],
      statusTags: [],
    });
  });

  it("exposes matching browser limits and disables the 51st step", async () => {
    renderForm(
      <AddDrillForm
        initialValues={{
          title: "Boundary drill",
          summary: "",
          notes: "",
          steps: Array.from({ length: DRILL_LIMITS.steps }, (_, index) => `Step ${index + 1}`),
          trainingMethodSlugs: [],
          tagSlugs: [],
          statusTagSlugs: [],
        }}
      />,
    );

    const addStep = await screen.findByRole("button", { name: "Add step" });
    expect(addStep).toBeDisabled();
    expect(addStep).toHaveAttribute("aria-describedby", "add-drill-step-limit");
    expect(screen.getByText(`Up to ${DRILL_LIMITS.steps} steps.`)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "maxlength",
      String(DRILL_LIMITS.titleCharacters),
    );
    expect(screen.getAllByPlaceholderText(/Start with|Next step/)).toHaveLength(DRILL_LIMITS.steps);
    expect(screen.getAllByPlaceholderText(/Start with|Next step/)[0]).toHaveAttribute(
      "maxlength",
      String(DRILL_LIMITS.stepCharacters),
    );
  });
});

function renderForm(form: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      {form}
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
