import { clamp, distance, lerpPoint, type Point } from './Geometry';

type Waypoint = Point | readonly [number, number];

const asPoint = (value: Waypoint): Point => (
  Array.isArray(value) ? { x: value[0], y: value[1] } : value as Point
);

export class PathSystem {
  private readonly points: readonly Point[];
  private readonly cumulative: readonly number[];
  readonly length: number;

  constructor(waypoints: readonly Waypoint[]) {
    if (waypoints.length < 2) {
      throw new RangeError('A path needs at least two waypoints');
    }

    this.points = waypoints.map(asPoint);
    const cumulative = [0];
    for (let index = 1; index < this.points.length; index += 1) {
      cumulative.push(
        cumulative.at(-1)! + distance(this.points[index - 1]!, this.points[index]!),
      );
    }
    this.cumulative = cumulative;
    this.length = cumulative.at(-1)!;

    if (this.length === 0) {
      throw new RangeError('A path must have non-zero length');
    }
  }

  positionAt(progress: number): Point {
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

  eta(progress: number, speedPerSecond: number): number {
    if (speedPerSecond <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return (this.length - clamp(progress, 0, this.length)) / speedPerSecond;
  }

  knockBack(progress: number, pathDistance: number): number {
    return clamp(progress - Math.max(0, pathDistance), 0, this.length);
  }

  closestProgressTo(point: Point): number {
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

      if (
        distanceSquared < bestDistanceSquared
        || (distanceSquared === bestDistanceSquared && progress < bestProgress)
      ) {
        bestDistanceSquared = distanceSquared;
        bestProgress = progress;
      }
    }

    return bestProgress;
  }

  firstProgressWithinCircle(center: Point, radius: number): number {
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
      if (discriminant < 0) {
        continue;
      }

      const root = Math.sqrt(discriminant);
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
