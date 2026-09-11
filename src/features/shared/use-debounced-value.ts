import { useCallback, useEffect, useRef, useState } from "react";

export const SERVER_FILTER_DEBOUNCE_MS = 250;

export function useDebouncedValue<T>(initialValue: T, delayMs = SERVER_FILTER_DEBOUNCE_MS) {
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const pendingValueRef = useRef(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingValue = useCallback(() => {
    if (timeoutRef.current === null) return;

    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const deferValue = useCallback((nextValue: T) => {
    if (Object.is(pendingValueRef.current, nextValue)) return;

    pendingValueRef.current = nextValue;
    cancelPendingValue();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setDebouncedValue(nextValue);
    }, delayMs);
  }, [cancelPendingValue, delayMs]);

  const setValueImmediately = useCallback((nextValue: T) => {
    pendingValueRef.current = nextValue;
    cancelPendingValue();
    setDebouncedValue(nextValue);
  }, [cancelPendingValue]);

  useEffect(() => () => cancelPendingValue(), [cancelPendingValue]);

  return { debouncedValue, deferValue, setValueImmediately };
}
