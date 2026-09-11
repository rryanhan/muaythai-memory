import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, MouseEventHandler, ReactElement, ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

const dayPickerModule = vi.hoisted(() => {
  let resolveLoading!: () => void;
  const loadingGate = new Promise<void>((resolve) => {
    resolveLoading = resolve;
  });

  return {
    loadStarted: vi.fn(),
    loadingGate,
    resolveLoading,
    props: null as null | {
      defaultMonth?: Date;
      disabled?: { after?: Date };
      endMonth?: Date;
      onSelect?: (date: Date | undefined) => void;
      selected?: Date;
    },
  };
});

vi.mock("@daypicker/react", async () => {
  const React = await import("react");
  dayPickerModule.loadStarted();
  await dayPickerModule.loadingGate;

  return {
    DayPicker: (props: NonNullable<typeof dayPickerModule.props>) => {
      dayPickerModule.props = props;
      return React.createElement(
        "button",
        {
          type: "button",
          onClick: () => props.onSelect?.(new Date(2026, 7, 3)),
        },
        "Choose August 3",
      );
    },
  };
});

vi.mock("vaul", async () => {
  const React = await import("react");
  type DrawerState = { open: boolean; onOpenChange: (open: boolean) => void };
  const DrawerContext = React.createContext<DrawerState | null>(null);

  function useDrawer() {
    const drawer = React.useContext(DrawerContext);
    if (!drawer) throw new Error("Drawer component rendered outside Drawer.Root.");
    return drawer;
  }

  function Root({
    children,
    open,
    onOpenChange,
  }: {
    children?: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
    return React.createElement(DrawerContext.Provider, { value: { open, onOpenChange } }, children);
  }

  function Trigger({ children }: { children: ReactNode }) {
    const { onOpenChange } = useDrawer();
    return cloneWithClick(React, children, () => onOpenChange(true));
  }

  function Close({ children }: { children: ReactNode }) {
    const { onOpenChange } = useDrawer();
    return cloneWithClick(React, children, () => onOpenChange(false));
  }

  function Portal({ children }: { children?: ReactNode }) {
    return useDrawer().open ? React.createElement(React.Fragment, null, children) : null;
  }

  const Content = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => React.createElement("div", { ref, ...props }, children),
  );
  const PassThrough = ({ children }: { children?: ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  );

  return {
    Drawer: {
      Close,
      Content,
      Description: PassThrough,
      Handle: () => React.createElement("div"),
      Overlay: () => React.createElement("div"),
      Portal,
      Root,
      Title: PassThrough,
      Trigger,
    },
  };
});

import { formatLocalDate, JournalDatePicker } from "./JournalDatePicker";

afterAll(() => dayPickerModule.resolveLoading());

describe("JournalDatePicker", () => {
  it("does not request or render the calendar while the drawer is closed", () => {
    render(<JournalDatePicker value="2026-08-02" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "August 2, 2026" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading calendar…" })).not.toBeInTheDocument();
    expect(dayPickerModule.loadStarted).not.toHaveBeenCalled();
  });

  it("loads the calendar on open and preserves its date constraints and selection", async () => {
    const onChange = vi.fn();
    render(<JournalDatePicker value="2026-08-02" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "August 2, 2026" }));

    expect(screen.getByRole("status")).toHaveTextContent("Loading calendar…");
    await waitFor(() => expect(dayPickerModule.loadStarted).toHaveBeenCalledOnce());

    await act(async () => {
      dayPickerModule.resolveLoading();
      await dayPickerModule.loadingGate;
    });

    const chooseDate = await screen.findByRole("button", { name: "Choose August 3" });
    expect(formatLocalDate(dayPickerModule.props?.selected ?? new Date(0))).toBe("2026-08-02");
    expect(formatLocalDate(dayPickerModule.props?.defaultMonth ?? new Date(0))).toBe("2026-08-02");
    expect(dayPickerModule.props?.disabled?.after).toEqual(dayPickerModule.props?.endMonth);

    fireEvent.click(chooseDate);

    expect(onChange).toHaveBeenCalledWith("2026-08-03");
    expect(screen.queryByRole("button", { name: "Choose August 3" })).not.toBeInTheDocument();
  });
});

function cloneWithClick(
  React: typeof import("react"),
  children: ReactNode,
  onClick: () => void,
) {
  if (!React.isValidElement(children)) return null;
  const child = children as ReactElement<{ onClick?: MouseEventHandler }>;
  return React.cloneElement(child, {
    onClick: (event) => {
      child.props.onClick?.(event);
      onClick();
    },
  });
}
