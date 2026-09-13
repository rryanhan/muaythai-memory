import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillDetail, TaxonomyResponse } from "@/data/types";
import { DrillFormRouteScreen } from "./DrillFormRouteScreen";

type FormCallbacks = {
  disabled?: boolean;
  onCancel?: () => void;
  onCreationCommitChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveSuccess?: (drillId: string) => void;
};

type DeleteCallbacks = {
  disabled?: boolean;
  drillId: string;
  onDeleted?: (deletedId: string) => void;
  onPendingChange?: (pending: boolean) => void;
};

const mocks = vi.hoisted(() => ({
  formProps: vi.fn(),
  deleteProps: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  setJournalDrillId: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/features/journal/JournalUploadProvider", () => ({
  useJournalUpload: () => ({ setDrillId: mocks.setJournalDrillId }),
}));

vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: ({
    disabled,
    onNavigate,
  }: {
    disabled?: boolean;
    onNavigate?: (destination: string) => void;
  }) => (
    <nav aria-label="Bottom navigation">
      <button type="button" disabled={disabled} onClick={() => onNavigate?.("/")}>Network</button>
      <button type="button" disabled={disabled} onClick={() => onNavigate?.("/?view=profile")}>Profile</button>
    </nav>
  ),
}));

vi.mock("./AddDrillForm", () => ({
  AddDrillForm: (props: FormCallbacks) => {
    mocks.formProps(props);
    return (
      <section aria-label="Mock drill form">
        <button type="button" disabled={props.disabled} onClick={() => props.onDirtyChange?.(true)}>
          Change title
        </button>
        <button type="button" disabled={props.disabled} onClick={() => props.onCancel?.()}>
          Cancel
        </button>
        <button type="button" disabled={props.disabled} onClick={() => props.onCreationCommitChange?.(true)}>
          Begin save
        </button>
        <button type="button" onClick={() => props.onCreationCommitChange?.(false)}>
          Settle save
        </button>
        <button
          type="button"
          onClick={() => {
            props.onDirtyChange?.(false);
            props.onSaveSuccess?.("00000000-0000-4000-8000-000000000501");
          }}
        >
          Resolve save
        </button>
      </section>
    );
  },
}));

vi.mock("./DeleteDrillSection", () => ({
  DeleteDrillSection: (props: DeleteCallbacks) => {
    mocks.deleteProps(props);
    return (
      <section aria-label="Mock delete section">
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onPendingChange?.(true)}
        >
          Begin delete
        </button>
        <button type="button" onClick={() => props.onDeleted?.(props.drillId)}>
          Resolve delete
        </button>
        <button type="button" onClick={() => props.onPendingChange?.(false)}>
          Settle delete
        </button>
      </section>
    );
  },
}));

vi.mock("@/features/capture/CaptureDiscardSheet", () => ({
  CaptureDiscardSheet: ({
    open,
    onStay,
    onDiscard,
    title,
    ariaLabel,
  }: {
    open: boolean;
    onStay: () => void;
    onDiscard: () => void;
    title: string;
    ariaLabel: string;
  }) => open ? (
    <div role="dialog" aria-label={title} data-dialog-aria-label={ariaLabel}>
      <button type="button" onClick={onStay}>Keep editing</button>
      <button type="button" onClick={onDiscard}>Discard changes</button>
    </div>
  ) : null,
}));

describe("DrillFormRouteScreen navigation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ entry: "drill-form" }, "", "/drills/new");
  });

  it("restores the guarded URL synchronously on Back, then discards to the true previous entry", async () => {
    window.history.replaceState({ entry: "previous" }, "", "/previous");
    window.history.pushState({ entry: "drill-form" }, "", "/drills/new");
    render(
      <DrillFormRouteScreen
        variant="create"
        fromJournal={false}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change title" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());

    act(() => window.history.back());
    expect(await screen.findByRole("dialog", { name: "Discard this drill?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/drills/new");
    expect(window.history.state?.__drillFormGuard).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(window.location.pathname).toBe("/previous"));
    expect(window.history.state?.entry).toBe("previous");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("restores on Forward, then discards to the exact forward target with its Next state", async () => {
    const forwardState = {
      entry: "forward-target",
      __NA: true,
      tree: ["", { children: ["forward-target", {}] }],
    };
    window.history.replaceState({ entry: "previous" }, "", "/previous");
    window.history.pushState({ entry: "drill-form" }, "", "/drills/new");
    window.history.pushState(forwardState, "", "/forward-target");
    window.history.pushState({ entry: "later-forward" }, "", "/later-forward");
    act(() => window.history.go(-2));
    await waitFor(() => expect(window.location.pathname).toBe("/drills/new"));

    render(
      <DrillFormRouteScreen
        variant="create"
        fromJournal={false}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change title" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());

    act(() => window.history.forward());
    expect(await screen.findByRole("dialog", { name: "Discard this drill?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/drills/new");
    expect(window.history.state?.__drillFormGuard).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(window.location.pathname).toBe("/forward-target"));
    expect(window.history.state).toEqual(forwardState);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("prompts for dirty bottom-nav navigation and blocks beforeunload", async () => {
    render(
      <DrillFormRouteScreen
        variant="create"
        fromJournal={false}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change title" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(await screen.findByRole("dialog", { name: "Discard this drill?" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    const enhancedDialog = await screen.findByRole("dialog", { name: "Discard this drill?" });
    expect(enhancedDialog).toHaveAttribute("data-dialog-aria-label", "Discard drill confirmation");
    fireEvent.click(within(enhancedDialog).getByRole("button", { name: "Discard changes" }));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(window.history.state?.__drillFormGuard).toBeUndefined();
  });

  it("blocks all route exits during save, then re-enables and retains the dirty guard on rejection", async () => {
    const downstreamPopState = vi.fn();
    render(
      <DrillFormRouteScreen
        variant="edit"
        drill={drillFixture}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change title" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());
    const guardKey = window.history.state.__drillFormGuard;
    fireEvent.click(screen.getByRole("button", { name: "Begin save" }));

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back to drill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin delete" })).toBeDisabled();

    window.addEventListener("popstate", downstreamPopState);
    window.history.replaceState({ entry: "attempted-target" }, "", "/previous");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    window.removeEventListener("popstate", downstreamPopState);
    expect(window.location.pathname).toBe("/drills/new");
    expect(window.history.state?.__drillFormGuard).toBe(guardKey);
    expect(downstreamPopState).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settle save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Back to drill" })).toBeEnabled());
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(window.history.state?.__drillFormGuard).toBe(guardKey);
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(await screen.findByRole("dialog", { name: "Discard drill changes?" })).toBeInTheDocument();
  });

  it("keeps the old edit screen locked when delete success is followed by settlement", async () => {
    render(
      <DrillFormRouteScreen
        variant="edit"
        drill={drillFixture}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin delete" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back to drill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change title" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Resolve delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Settle delete" }));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/?view=library");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(window.history.state?.__drillFormGuard).toBeUndefined();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back to drill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change title" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin delete" })).toBeDisabled();
  });

  it("latches save success through settlement and reconnects journal drafts", async () => {
    render(
      <DrillFormRouteScreen
        variant="create"
        fromJournal
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change title" }));
    fireEvent.click(screen.getByRole("button", { name: "Begin save" }));
    await waitFor(() => expect(window.history.state?.__drillFormGuard).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Resolve save" }));
    fireEvent.click(screen.getByRole("button", { name: "Settle save" }));

    expect(mocks.setJournalDrillId).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000501",
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/journal/new");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(window.history.state?.__drillFormGuard).toBeUndefined();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back to journal entry" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change title" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("forces a rendered child lock when an unchanged edit succeeds before settlement", () => {
    render(
      <DrillFormRouteScreen
        variant="edit"
        drill={drillFixture}
        initialTaxonomy={taxonomyFixture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin save" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve save" }));
    fireEvent.click(screen.getByRole("button", { name: "Settle save" }));

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/drills/00000000-0000-4000-8000-000000000501",
    );
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Change title" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network" })).toBeDisabled();
  });
});

const taxonomyFixture: TaxonomyResponse = {
  trainingMethods: [],
  tagCategories: [],
  standardTags: [],
  customTags: [],
  statusTags: [],
};

const drillFixture: DrillDetail = {
  id: "00000000-0000-4000-8000-000000000601",
  title: "Rear kick",
  summary: "",
  notes: null,
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000602",
      position: 1,
      body: "Step outside.",
    },
  ],
  trainingMethods: [],
  tags: [],
  customTags: [],
  statusTags: [],
  createdAt: new Date("2026-09-13T12:00:00Z"),
  updatedAt: new Date("2026-09-13T12:00:00Z"),
};
