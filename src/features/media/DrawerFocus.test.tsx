import { render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("vaul", async () => {
  const React = await import("react");
  const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  return {
    Drawer: {
      Content,
      Description: PassThrough,
      Handle: () => <div />,
      Overlay: () => <div />,
      Portal: PassThrough,
      Root: PassThrough,
      Title: PassThrough,
    },
  };
});

import { JournalCoverEditor } from "@/features/journal/JournalCoverEditor";
import { JournalDiscardSheet } from "@/features/journal/JournalDiscardSheet";
import { ProfileDiscardSheet } from "@/features/profile/ProfileDiscardSheet";
import { CaptureDiscardSheet } from "@/features/capture/CaptureDiscardSheet";

describe("media drawer focus", () => {
  it("focuses and restores the journal cover drawer", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:journal-video"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const opener = focusedOpener();
    const { unmount } = render(
      <JournalCoverEditor
        file={new File(["video"], "video.mp4", { type: "video/mp4" })}
        initialTimeSeconds={null}
        onCancel={vi.fn()}
        onUseCover={vi.fn()}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeVisible();
    await waitFor(() => expect(cancel).toHaveFocus());
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("focuses and restores both discard drawers as they open and close", async () => {
    const profileOpener = focusedOpener();
    const profile = render(
      <ProfileDiscardSheet open={false} onStay={vi.fn()} onDiscard={vi.fn()} />,
    );
    profile.rerender(<ProfileDiscardSheet open onStay={vi.fn()} onDiscard={vi.fn()} />);
    const profileStay = screen.getByRole("button", { name: "Keep editing" });
    expect(profileStay).toBeVisible();
    await waitFor(() => expect(profileStay).toHaveFocus());
    profile.rerender(<ProfileDiscardSheet open={false} onStay={vi.fn()} onDiscard={vi.fn()} />);
    expect(profileOpener).toHaveFocus();
    profile.unmount();
    profileOpener.remove();

    const journalOpener = focusedOpener();
    const journal = render(
      <JournalDiscardSheet
        open={false}
        pending={false}
        onStay={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    journal.rerender(
      <JournalDiscardSheet open pending={false} onStay={vi.fn()} onDiscard={vi.fn()} />,
    );
    const journalStay = screen.getByRole("button", { name: "Keep editing" });
    expect(journalStay).toBeVisible();
    await waitFor(() => expect(journalStay).toHaveFocus());
    journal.rerender(
      <JournalDiscardSheet
        open={false}
        pending={false}
        onStay={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(journalOpener).toHaveFocus();
    journal.unmount();
    journalOpener.remove();
  });

  it("focuses and restores the capture discard drawer as it opens and closes", async () => {
    const opener = focusedOpener();
    const capture = render(
      <CaptureDiscardSheet open={false} onStay={vi.fn()} onDiscard={vi.fn()} />,
    );

    capture.rerender(<CaptureDiscardSheet open onStay={vi.fn()} onDiscard={vi.fn()} />);
    const stay = screen.getByRole("button", { name: "Keep editing" });
    expect(stay).toBeVisible();
    await waitFor(() => expect(stay).toHaveFocus());

    capture.rerender(
      <CaptureDiscardSheet open={false} onStay={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(opener).toHaveFocus();
    capture.unmount();
    opener.remove();
  });
});

function focusedOpener(): HTMLButtonElement {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  return opener;
}
