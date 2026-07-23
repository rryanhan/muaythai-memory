import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cropperMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

const avatarMock = vi.hoisted(() => ({
  createCroppedAvatar: vi.fn(),
}));

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

vi.mock("react-easy-crop", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      cropperMock.props = props;
      React.useEffect(() => {
        const onCropComplete = props.onCropComplete as (area: unknown, pixels: unknown) => void;
        onCropComplete({}, { height: 400, width: 400, x: 10, y: 20 });
      }, []);
      return (
        <button
          type="button"
          onClick={() => {
            const onCropComplete = props.onCropComplete as (area: unknown, pixels: unknown) => void;
            onCropComplete({}, { height: 200, width: 200, x: 90, y: 90 });
          }}
        >
          Move crop
        </button>
      );
    },
  };
});

vi.mock("./create-cropped-avatar", () => ({
  createCroppedAvatar: avatarMock.createCroppedAvatar,
}));

import { AvatarCropSheet } from "./AvatarCropSheet";

beforeEach(() => {
  cropperMock.props = null;
  avatarMock.createCroppedAvatar.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:avatar-source"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("AvatarCropSheet", () => {
  it("locks crop interaction during export and restores focus when it closes", async () => {
    let resolveExport: ((file: File) => void) | null = null;
    avatarMock.createCroppedAvatar.mockReturnValue(new Promise<File>((resolve) => {
      resolveExport = resolve;
    }));
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onUsePhoto = vi.fn();
    const { unmount } = render(
      <AvatarCropSheet
        file={new File(["avatar"], "avatar.png", { type: "image/png" })}
        onCancel={vi.fn()}
        onUsePhoto={onUsePhoto}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
      expect(screen.getByRole("button", { name: "Use Photo" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Use Photo" }));

    await waitFor(() => {
      expect(screen.getByRole("slider", { name: "Profile photo zoom" })).toBeDisabled();
    });
    expect((cropperMock.props?.onTouchRequest as () => boolean)()).toBe(false);
    expect((cropperMock.props?.onWheelRequest as () => boolean)()).toBe(false);
    expect(cropperMock.props?.cropperProps).toMatchObject({
      "aria-disabled": true,
      tabIndex: -1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Move crop" }));
    expect(avatarMock.createCroppedAvatar).toHaveBeenCalledWith("blob:avatar-source", {
      height: 400,
      width: 400,
      x: 10,
      y: 20,
    });

    const cropped = new File(["cropped"], "profile-avatar.webp", { type: "image/webp" });
    act(() => resolveExport?.(cropped));
    await waitFor(() => expect(onUsePhoto).toHaveBeenCalledWith(cropped));

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
