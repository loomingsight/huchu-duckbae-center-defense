import type { Point } from '../world/Geometry';

export interface ImpactFeedbackTarget {
  getFeedbackAnchor(): Point;
  flash(durationMs: number): void;
  recoil(input: {
    readonly direction: Point;
    readonly distancePx: number;
    readonly popScale: number;
    readonly durationMs: number;
  }): void;
  beginDeath(durationMs: 160): void;
}
