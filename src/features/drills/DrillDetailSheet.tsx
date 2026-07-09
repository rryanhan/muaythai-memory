"use client";

import { useRef, type PointerEvent } from "react";
import { Drawer } from "vaul";
import type { DrillDetail } from "@/data";
import { DrillDetailContent } from "@/features/drills/DrillDetailContent";

type DrillDetailLoadState =
  | { status: "loading"; drillId: string }
  | { status: "loaded"; drill: DrillDetail }
  | { status: "error"; drillId: string; message: string };

type DrillDetailSheetProps = {
  state: DrillDetailLoadState;
  badgeByIconKey: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnimationEnd: (open: boolean) => void;
  onRetry: () => void;
};

export function DrillDetailSheet({
  state,
  badgeByIconKey,
  open,
  onOpenChange,
  onAnimationEnd,
  onRetry,
}: DrillDetailSheetProps) {
  const handleDragStartYRef = useRef<number | null>(null);

  function handlePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    const isHandleTarget =
      target instanceof Element && Boolean(target.closest("[data-vaul-handle], [data-vaul-handle-hitarea]"));

    handleDragStartYRef.current = isHandleTarget ? event.clientY : null;
  }

  function handlePointerUpCapture(event: PointerEvent<HTMLDivElement>) {
    const startY = handleDragStartYRef.current;
    handleDragStartYRef.current = null;

    if (startY !== null && event.clientY - startY > 80) {
      onOpenChange(false);
    }
  }

  function clearHandleDrag() {
    handleDragStartYRef.current = null;
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      onAnimationEnd={onAnimationEnd}
      direction="bottom"
      modal
      dismissible
      handleOnly
      closeThreshold={0.18}
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="drill-detail-backdrop" />
        <Drawer.Content
          className="drill-detail-sheet"
          aria-label="Drill detail"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerDownCapture={handlePointerDownCapture}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerUpCapture={handlePointerUpCapture}
          onPointerCancelCapture={clearHandleDrag}
          onClick={(event) => event.stopPropagation()}
        >
          <div>
            <Drawer.Handle className="sheet-handle" />
          </div>
          <header className="drill-detail-sheet-header">
            <Drawer.Title asChild>
              <p className="eyebrow">Drill Detail</p>
            </Drawer.Title>
            <Drawer.Close asChild>
              <button type="button">Close</button>
            </Drawer.Close>
          </header>
          <Drawer.Description className="sr-only">{getSheetDescription(state)}</Drawer.Description>

          {state.status === "loading" && (
            <div className="drill-detail-state">
              <h2>Loading drill</h2>
              <p>Pulling the full steps and notes.</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="drill-detail-state">
              <h2>Couldn&apos;t load drill</h2>
              <p>{state.message}</p>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}

          {state.status === "loaded" && <DrillDetailContent drill={state.drill} badgeByIconKey={badgeByIconKey} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function getSheetDescription(state: DrillDetailLoadState): string {
  if (state.status === "loading") {
    return "Loading the selected drill details.";
  }

  if (state.status === "error") {
    return "The selected drill could not be loaded.";
  }

  return `${state.drill.title} drill details.`;
}
