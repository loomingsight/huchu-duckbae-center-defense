import type { Point } from './Geometry';

export interface MovementPose {
  readonly position: Point;
  readonly heading: Point;
}

interface TrailEntry extends MovementPose {
  readonly distance: number;
}

const EPSILON = 1e-9;

export class MovementTrail {
  private entries: TrailEntry[] = [];

  constructor(private readonly capacityPx: number) {
    if (!Number.isFinite(capacityPx) || capacityPx <= 0) {
      throw new RangeError('Movement trail capacity must be positive');
    }
  }

  push(position: Point, heading: Point): void {
    assertPoint(position, 'Movement trail position');
    const normalizedHeading = normalized(heading, 'Movement trail heading');
    if (this.entries.length === 0) {
      this.reset(position, normalizedHeading);
      return;
    }
    const last = this.entries.at(-1)!;
    const travelled = Math.hypot(
      position.x - last.position.x,
      position.y - last.position.y,
    );
    if (travelled <= EPSILON) {
      this.entries[this.entries.length - 1] = {
        position: { ...position },
        heading: normalizedHeading,
        distance: last.distance,
      };
      return;
    }
    this.entries.push({
      position: { ...position },
      heading: normalizedHeading,
      distance: last.distance + travelled,
    });
    this.prune();
  }

  sampleBehind(distancePx: number): MovementPose {
    assertFiniteNonNegative(distancePx, 'Movement trail sample distance');
    if (this.entries.length === 0) {
      throw new Error('Movement trail must be reset before sampling');
    }
    const last = this.entries.at(-1)!;
    const targetDistance = last.distance - distancePx;
    const first = this.entries[0]!;
    if (targetDistance <= first.distance + EPSILON) {
      return copyPose(first);
    }
    for (let index = 1; index < this.entries.length; index += 1) {
      const right = this.entries[index]!;
      if (targetDistance > right.distance + EPSILON) continue;
      const left = this.entries[index - 1]!;
      const span = right.distance - left.distance;
      const ratio = span <= EPSILON ? 1 : (targetDistance - left.distance) / span;
      return {
        position: {
          x: left.position.x + (right.position.x - left.position.x) * ratio,
          y: left.position.y + (right.position.y - left.position.y) * ratio,
        },
        heading: normalizedOrFallback({
          x: left.heading.x + (right.heading.x - left.heading.x) * ratio,
          y: left.heading.y + (right.heading.y - left.heading.y) * ratio,
        }, right.heading),
      };
    }
    return copyPose(last);
  }

  reset(position: Point, heading: Point): void {
    assertPoint(position, 'Movement trail position');
    const normalizedHeading = normalized(heading, 'Movement trail heading');
    this.entries = [
      {
        position: {
          x: position.x - normalizedHeading.x * this.capacityPx,
          y: position.y - normalizedHeading.y * this.capacityPx,
        },
        heading: normalizedHeading,
        distance: 0,
      },
      {
        position: { ...position },
        heading: normalizedHeading,
        distance: this.capacityPx,
      },
    ];
  }

  private prune(): void {
    const minimumDistance = this.entries.at(-1)!.distance - this.capacityPx;
    while (
      this.entries.length > 2
      && this.entries[1]!.distance <= minimumDistance + EPSILON
    ) {
      this.entries.shift();
    }
    if (this.entries[0]!.distance + EPSILON < minimumDistance) {
      const left = this.entries[0]!;
      const right = this.entries[1]!;
      const ratio = (minimumDistance - left.distance) / (right.distance - left.distance);
      this.entries[0] = {
        position: {
          x: left.position.x + (right.position.x - left.position.x) * ratio,
          y: left.position.y + (right.position.y - left.position.y) * ratio,
        },
        heading: normalizedOrFallback({
          x: left.heading.x + (right.heading.x - left.heading.x) * ratio,
          y: left.heading.y + (right.heading.y - left.heading.y) * ratio,
        }, right.heading),
        distance: minimumDistance,
      };
    }
  }
}

function copyPose(entry: TrailEntry): MovementPose {
  return {
    position: { ...entry.position },
    heading: { ...entry.heading },
  };
}

function normalized(point: Point, label: string): Point {
  assertPoint(point, label);
  const length = Math.hypot(point.x, point.y);
  if (length <= EPSILON) throw new RangeError(`${label} must not be zero`);
  return { x: point.x / length, y: point.y / length };
}

function normalizedOrFallback(point: Point, fallback: Point): Point {
  const length = Math.hypot(point.x, point.y);
  return length <= EPSILON
    ? { ...fallback }
    : { x: point.x / length, y: point.y / length };
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
