import type { ComponentProps } from "react";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      onClose={onClose}
      onRetry={vi.fn()}
    />
  );
}
