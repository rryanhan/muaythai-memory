import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels a deferred update when a value is set immediately", async () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Defer muay" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset now" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByTestId("debounced-value")).toBeEmptyDOMElement();
  });
});

function Harness() {
  const { debouncedValue, deferValue, setValueImmediately } = useDebouncedValue("");

  return (
    <>
      <output data-testid="debounced-value">{debouncedValue}</output>
      <button type="button" onClick={() => deferValue("muay")}>Defer muay</button>
      <button type="button" onClick={() => setValueImmediately("")}>Reset now</button>
    </>
  );
}
