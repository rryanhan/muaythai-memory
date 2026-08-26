import type { PhysicsSimulation, Size } from "./network-physics";

export function getVisibleViewportSize(width: number, height: number): Size | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function shouldResumeNetworkSimulation(active: boolean, alpha: number): boolean {
  return active && alpha > 0.012;
}

export function pauseNetworkSimulation(
  simulation: PhysicsSimulation | null,
  cancelFrame: (frame: number) => void,
): void {
  if (!simulation) return;
  if (simulation.frame !== null) cancelFrame(simulation.frame);
  simulation.frame = null;
  simulation.dragging = null;
  for (const node of simulation.nodes) node.dragging = false;
}

export function resumeNetworkSimulation(
  active: boolean,
  simulation: PhysicsSimulation | null,
  run: (simulation: PhysicsSimulation) => void,
): boolean {
  if (!simulation || !shouldResumeNetworkSimulation(active, simulation.alpha)) return false;
  run(simulation);
  return true;
}
