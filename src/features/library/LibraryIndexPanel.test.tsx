import type { ComponentProps } from "react";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryIndexFrame } from "./LibraryIndexFrame";
import { LibraryIndexPanel } from "./LibraryIndexPanel";

const routes = {
  capture: "/capture/new?mode=voice&from=library",
  add: "/drills/new",
  guide: "/onboarding/first-drill?replay=1&next=%2F%3Fview%3Dlibrary",
} as const;

const mocks = vi.hoisted(() => ({
  linkProps: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => {
    mocks.linkProps({ href: props.href, prefetch });
    return <a {...props}>{children}</a>;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mocks.prefetch }),
}));

describe("LibraryIndexPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not prefetch creation routes before or when the panel opens", () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open index
          </button>
          {open ? <Panel onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    render(<Harness />);
    expect(mocks.prefetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open index" }));

    expect(screen.getByRole("dialog", { name: "Training Method index" })).toBeInTheDocument();
    expect(mocks.prefetch).not.toHaveBeenCalled();
    expect(mocks.linkProps.mock.calls.map(([props]) => props)).toEqual([
      { href: routes.capture, prefetch: false },
      { href: routes.add, prefetch: false },
      { href: routes.guide, prefetch: false },
    ]);
  });

  it("isolates the portaled dialog, traps focus, and restores the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open index
          </button>
          {open ? <Panel onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    const { container } = render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open index" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Training Method index" });
    const close = screen.getByRole("button", { name: "Close" });
    const lastMethod = screen.getByRole("button", { name: "All Drills" });
    expect(dialog.parentElement).toBe(document.body);
    expect(container).toHaveAttribute("inert", "");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");
    expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(lastMethod).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Training Method index" })).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");
  });

  it.each([
    ["pointer intent", "Capture Drill", "pointerEnter", routes.capture],
    ["keyboard focus", "Add Drill", "focus", routes.add],
    ["touch intent", "First Drill Guide", "touchStart", routes.guide],
  ] as const)("prefetches only the intended route on %s", (_label, linkName, event, route) => {
    render(<Panel />);

    fireEvent[event](screen.getByRole("link", { name: linkName }));

    expect(mocks.prefetch).toHaveBeenCalledOnce();
    expect(mocks.prefetch).toHaveBeenCalledWith(route);
  });
});

function Panel({ onClose = vi.fn() }: { onClose?: () => void }) {
  return (
    <LibraryIndexFrame onClose={onClose}>
      <LibraryIndexPanel
        methods={[]}
        selectedMethodSlug={null}
        taxonomyState={{
          status: "loaded",
          taxonomy: {
            trainingMethods: [],
            tagCategories: [],
            standardTags: [],
            customTags: [],
            statusTags: [],
          },
        }}
        onSelectMethod={vi.fn()}
        onRetry={vi.fn()}
      />
    </LibraryIndexFrame>
  );
}
