import type { Point } from './Geometry';
import { PathSystem } from './PathSystem';

type Waypoint = Point | readonly [number, number];

export interface PathPose {
  readonly position: Point;
  readonly tangent: Point;
  readonly normal: Point;
  readonly headingRad: number;
}

export class PathPoseSampler {
  private readonly path: PathSystem;
  readonly length: number;

  constructor(points: readonly Waypoint[]) {
    this.path = new PathSystem(points);
    this.length = this.path.length;
  }

  sampleExtended(distancePx: number): PathPose {
    if (!Number.isFinite(distancePx)) {
      throw new RangeError('distancePx must be finite');
    }

    const at = (distance: number): Point => this.path.positionAtExtended(distance);
    const position = at(distancePx);
    let before = at(distancePx - 8);
    let after = at(distancePx + 8);

    if (Math.hypot(after.x - before.x, after.y - before.y) < 1e-9) {
      before = at(Math.max(0, this.length - 16));
      after = at(this.length);
    }

    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy);
    const tangent = { x: dx / length, y: dy / length };

    return {
      position,
      tangent,
      normal: { x: -tangent.y, y: tangent.x },
      headingRad: Math.atan2(tangent.y, tangent.x),
    };
  }
}
