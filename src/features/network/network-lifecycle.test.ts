import { describe, expect, it } from "vitest";
import {
  getVisibleViewportSize,
  pauseNetworkSimulation,
  resumeNetworkSimulation,
  shouldResumeNetworkSimulation,
} from "./network-lifecycle";
import type { PhysicsSimulation } from "./network-physics";

describe("Network lifecycle decisions", () => {
  it("ignores hidden and invalid ResizeObserver measurements", () => {
    expect(getVisibleViewportSize(0, 844)).toBeNull();
    expect(getVisibleViewportSize(390, 0)).toBeNull();
    expect(getVisibleViewportSize(Number.NaN, 844)).toBeNull();
    expect(getVisibleViewportSize(390.4, 843.6)).toEqual({ width: 390, height: 844 });
  });

  it("resumes only an active simulation that has work left", () => {
    expect(shouldResumeNetworkSimulation(false, 1)).toBe(false);
    expect(shouldResumeNetworkSimulation(true, 0.012)).toBe(false);
    expect(shouldResumeNetworkSimulation(true, 0.013)).toBe(true);
  });

  it("cancels pending work and resumes the same simulation without reheating it", () => {
    const simulation = {
      alpha: 0.42,
      frame: 77,
      width: 500,
      height: 980,
      nodes: [{
        id: "drill:fixture",
        entityId: "00000000-0000-4000-8000-000000000001",
        type: "drill",
        label: "Fixture",
        active: false,
        matched: false,
        selected: false,
        connectedMethodSlugs: [],
        displayLabel: "Fixture",
        vx: 0,
        vy: 0,
        x: 1,
        y: 1,
        anchorX: 1,
        anchorY: 1,
        r: 7.5,
        box: { left: -8, right: 8, top: -8, bottom: 8 },
        dragging: true,
      }],
      links: [],
      dragging: {} as never,
    } satisfies PhysicsSimulation;
    const cancelled: number[] = [];
    const resumed: PhysicsSimulation[] = [];

    pauseNetworkSimulation(simulation, (frame) => cancelled.push(frame));
    expect(cancelled).toEqual([77]);
    expect(simulation.frame).toBeNull();
    expect(simulation.dragging).toBeNull();
    expect(simulation.nodes[0]?.dragging).toBe(false);
    expect(simulation.alpha).toBe(0.42);

    expect(resumeNetworkSimulation(true, simulation, (current) => resumed.push(current))).toBe(true);
    expect(resumed).toEqual([simulation]);
    expect(simulation.alpha).toBe(0.42);
  });
});
