import { clamp, distance, lerpPoint, type Point } from './Geometry';

type Waypoint = Point | readonly [number, number];

const asPoint = (value: Waypoint): Point => (
  Array.isArray(value) ? { x: value[0], y: value[1] } : value as Point
);

const requireFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
};

const rejectNaN = (value: number, label: string): void => {
  if (Number.isNaN(value)) {
    throw new RangeError(`${label} must not be NaN`);
  }
};

const requireFinitePoint = (point: Point, label: string): void => {
  requireFinite(point.x, `${label}.x`);
  requireFinite(point.y, `${label}.y`);
};

export class PathSystem {
  private readonly points: readonly Point[];
  private readonly cumulative: readonly number[];
  readonly length: number;

  constructor(waypoints: readonly Waypoint[]) {
    if (waypoints.length < 2) {
      throw new RangeError('A path needs at least two waypoints');
    }

    this.points = waypoints.map(asPoint);
    this.points.forEach((point, index) => requireFinitePoint(point, `waypoint[${index}]`));
    const cumulative = [0];
    for (let index = 1; index < this.points.length; index += 1) {
      const segmentLength = distance(this.points[index - 1]!, this.points[index]!);
      if (!Number.isFinite(segmentLength) || segmentLength <= 0) {
        if (this.points.length === 2 && segmentLength === 0) {
          throw new RangeError('A path must have non-zero length');
        }
        throw new RangeError(`path segment ${index - 1}-${index} must have finite positive length`);
      }
      const totalLength = cumulative.at(-1)! + segmentLength;
      if (!Number.isFinite(totalLength)) {
        throw new RangeError('path length must be finite');
      }
      cumulative.push(totalLength);
    }
    this.cumulative = cumulative;
    this.length = cumulative.at(-1)!;
  }

  positionAt(progress: number): Point {
    rejectNaN(progress, 'progress');
    const value = clamp(progress, 0, this.length);
    if (value === this.length) {
      return { ...this.points.at(-1)! };
    }

    const segment = this.cumulative.findIndex((end, index) => index > 0 && value <= end);
    const startDistance = this.cumulative[segment - 1]!;
    const segmentLength = this.cumulative[segment]! - startDistance;
    return lerpPoint(
      this.points[segment - 1]!,
      this.points[segment]!,
      (value - startDistance) / segmentLength,
    );
  }

  positionAtExtended(distancePx: number): Point {
    rejectNaN(distancePx, 'distancePx');
    if (distancePx >= 0 || !Number.isFinite(distancePx)) {
      return this.positionAt(distancePx);
    }

    const start = this.points[0]!;
    const next = this.points[1]!;
    const firstSegmentLength = this.cumulative[1]!;
    return {
      x: start.x + (next.x - start.x) / firstSegmentLength * distancePx,
      y: start.y + (next.y - start.y) / firstSegmentLength * distancePx,
    };
  }

  eta(progress: number, speedPerSecond: number): number {
    rejectNaN(progress, 'progress');
    rejectNaN(speedPerSecond, 'speedPerSecond');
    if (speedPerSecond <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return (this.length - clamp(progress, 0, this.length)) / speedPerSecond;
  }

  knockBack(progress: number, pathDistance: number): number {
    rejectNaN(progress, 'progress');
    rejectNaN(pathDistance, 'pathDistance');
    if (pathDistance === Number.POSITIVE_INFINITY) {
      return 0;
    }
    return clamp(progress - Math.max(0, pathDistance), 0, this.length);
  }

  closestProgressTo(point: Point): number {
    requireFinitePoint(point, 'point');
    let bestProgress = 0;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (let index = 1; index < this.points.length; index += 1) {
      const start = this.points[index - 1]!;
      const end = this.points[index]!;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        ),
      );
      const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
      const distanceSquared = (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
      const progress = this.cumulative[index - 1]! + Math.sqrt(lengthSquared) * ratio;
      const distanceTolerance = 16 * Number.EPSILON * Math.max(
        1,
        distanceSquared,
        bestDistanceSquared,
      );
      const isFirstCandidate = !Number.isFinite(bestDistanceSquared);
      const isCloser = distanceSquared < bestDistanceSquared - distanceTolerance;
      const isTie = Math.abs(distanceSquared - bestDistanceSquared) <= distanceTolerance;

      if (isFirstCandidate || isCloser || (isTie && progress < bestProgress)) {
        bestDistanceSquared = distanceSquared;
        bestProgress = progress;
      }
    }

    return bestProgress;
  }

  firstProgressWithinCircle(center: Point, radius: number): number {
    requireFinitePoint(center, 'center');
    rejectNaN(radius, 'radius');
    if (radius < 0) {
      throw new RangeError('Circle radius must be non-negative');
    }

    for (let index = 1; index < this.points.length; index += 1) {
      const start = this.points[index - 1]!;
      const end = this.points[index]!;
      if (distance(start, center) <= radius) {
        return this.cumulative[index - 1]!;
      }

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const fx = start.x - center.x;
      const fy = start.y - center.y;
      const a = dx * dx + dy * dy;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - radius * radius;
      const discriminant = b * b - 4 * a * c;
      const discriminantScale = b * b + Math.abs(4 * a * c);
      const discriminantTolerance = 16 * Number.EPSILON * Math.max(1, discriminantScale);
      if (discriminant < -discriminantTolerance) {
        continue;
      }

      const root = Math.sqrt(Math.max(0, discriminant));
      const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter((ratio) => ratio >= 0 && ratio <= 1)
        .sort((left, right) => left - right);
      if (candidates.length > 0) {
        return this.cumulative[index - 1]! + candidates[0]! * Math.sqrt(a);
      }
    }

    if (distance(this.points.at(-1)!, center) <= radius) {
      return this.length;
    }
    throw new RangeError(`Path never enters circle radius ${radius}`);
  }
}
