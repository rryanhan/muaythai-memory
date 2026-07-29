import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecodedImage } from "./DecodedImage";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

describe("DecodedImage", () => {
  it("stays hidden from ready styles until decoding completes", async () => {
    let finishDecode: (() => void) | undefined;
    const decode = vi.fn(() => new Promise<void>((resolve) => {
      finishDecode = resolve;
    }));
    mockImageDecode(decode);

    render(<DecodedImage src="https://example.com/avatar.webp" alt="Avatar" />);
    const image = screen.getByRole("img", { name: "Avatar" });

    expect(image).toHaveAttribute("data-image-state", "loading");
    fireEvent.load(image);
    expect(image).toHaveAttribute("data-image-state", "loading");

    finishDecode?.();

    await waitFor(() => {
      expect(image).toHaveAttribute("data-image-state", "ready");
    });
  });

  it("returns to loading when the source changes", async () => {
    mockImageDecode(vi.fn().mockResolvedValue(undefined));
    const { rerender } = render(
      <DecodedImage src="https://example.com/first.webp" alt="Avatar" />,
    );
    const image = screen.getByRole("img", { name: "Avatar" });

    fireEvent.load(image);
    await waitFor(() => {
      expect(image).toHaveAttribute("data-image-state", "ready");
    });

    rerender(<DecodedImage src="https://example.com/second.webp" alt="Avatar" />);
    expect(image).toHaveAttribute("data-image-state", "loading");
  });

  it("keeps the fallback state available when loading fails", () => {
    render(<DecodedImage src="https://example.com/missing.webp" alt="Avatar" />);
    const image = screen.getByRole("img", { name: "Avatar" });

    fireEvent.error(image);

    expect(image).toHaveAttribute("data-image-state", "error");
  });
});

function mockImageDecode(implementation: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: implementation,
  });
}
