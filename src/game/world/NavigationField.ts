import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import {
  PATH_DEFINITIONS,
  type PathDefinitions,
  type PathWaypoint,
} from '../data/pathDefinitions';
import type { Point } from './Geometry';

export const NAV_CELL_SIZE = 30;
export const NAV_RECOMPUTE_INTERVAL_MS = 200;
export const NAV_TARGET_DISTANCE_PX = 15;

const DEFAULT_CORRIDOR_RADIUS = 45;
const DEFAULT_JUNCTION_RADIUS = 90;
const COST_EPSILON = 1e-9;

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly index: number;
  readonly center: Point;
}

interface QueueEntry {
  readonly index: number;
  readonly distance: number;
}

export interface NavigationFieldOptions {
  readonly corridorRadius?: number;
  readonly junctionRadius?: number;
}

export interface NavigationFieldSnapshot {
  readonly columns: number;
  readonly rows: number;
  readonly revision: number;
  readonly recomputeCount: number;
  readonly targetCell: Readonly<{ x: number; y: number }> | null;
}

export class NavigationField {
  private readonly columns: number;
  private readonly rows: number;
  private readonly cells: readonly Cell[];
  private readonly walkable: readonly boolean[];
  private readonly distances: number[];
  private targetCellIndex: number | null = null;
  private latestTarget: Point | null = null;
  private lastRecomputeTarget: Point | null = null;
  private elapsedSinceRecomputeMs = 0;
  private revision = 0;
  private recomputeCount = 0;

  static createDefault(): NavigationField {
    return new NavigationField(
      PATH_DEFINITIONS,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      NAV_CELL_SIZE,
    );
  }

  constructor(
    paths: PathDefinitions,
    private readonly width: number,
    private readonly height: number,
    private readonly cellSize: number,
    options: NavigationFieldOptions = {},
  ) {
    assertPositiveFinite(width, 'Navigation width');
    assertPositiveFinite(height, 'Navigation height');
    assertPositiveFinite(cellSize, 'Navigation cell size');
    const pathEntries = Object.values(paths);
    if (pathEntries.length === 0) {
      throw new RangeError('Navigation paths are required');
    }
    pathEntries.forEach((path, pathIndex) => validatePath(path, pathIndex));

    const corridorRadius = options.corridorRadius ?? DEFAULT_CORRIDOR_RADIUS;
    const junctionRadius = options.junctionRadius ?? DEFAULT_JUNCTION_RADIUS;
    assertFiniteNonNegative(corridorRadius, 'Navigation corridor radius');
    assertFiniteNonNegative(junctionRadius, 'Navigation junction radius');

    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = Array.from({ length: this.columns * this.rows }, (_, index) => {
      const x = index % this.columns;
      const y = Math.floor(index / this.columns);
      return {
        x,
        y,
        index,
        center: {
          x: Math.min(width, (x + 0.5) * cellSize),
          y: Math.min(height, (y + 0.5) * cellSize),
        },
      };
    });
    const segments = pathEntries.flatMap((path) => path.slice(1).map((to, index) => ({
      from: waypointPoint(path[index]!),
      to: waypointPoint(to),
    })));
    const junction = { x: width / 2, y: height / 2 };
    this.walkable = this.cells.map(({ center }) => (
      segments.some(({ from, to }) => distanceToSegment(center, from, to) <= corridorRadius)
      || (junctionRadius > 0 && pointDistance(center, junction) <= junctionRadius)
    ));
    if (!this.walkable.some(Boolean)) {
      throw new RangeError('Navigation paths do not intersect the grid');
    }
    this.distances = Array.from(
      { length: this.cells.length },
      () => Number.POSITIVE_INFINITY,
    );
  }

  step(stepMs: number, target: Point): boolean {
    assertFiniteNonNegative(stepMs, 'Navigation stepMs');
    assertFinitePoint(target, 'Navigation target');
    this.latestTarget = { ...target };
    this.elapsedSinceRecomputeMs += stepMs;
    const directTargetCell = this.cellIndexAt(target);
    const candidateTargetCell = this.walkable[directTargetCell]
      ? directTargetCell
      : this.nearestWalkableCell(target);
    if (candidateTargetCell === null) return false;

    const firstComputation = this.targetCellIndex === null || this.lastRecomputeTarget === null;
    const intervalReady = this.elapsedSinceRecomputeMs + COST_EPSILON
      >= NAV_RECOMPUTE_INTERVAL_MS;
    const targetCellChanged = candidateTargetCell !== this.targetCellIndex;
    const targetMovedEnough = this.lastRecomputeTarget === null
      || pointDistance(this.lastRecomputeTarget, target) + COST_EPSILON
        >= NAV_TARGET_DISTANCE_PX;
    if (!firstComputation && (!intervalReady || (!targetCellChanged && !targetMovedEnough))) {
      return false;
    }

    this.recompute(candidateTargetCell);
    this.lastRecomputeTarget = { ...target };
    this.elapsedSinceRecomputeMs = 0;
    this.revision += 1;
    this.recomputeCount += 1;
    return true;
  }

  directionFrom(position: Point): Point {
    assertFinitePoint(position, 'Navigation position');
    if (this.latestTarget === null || this.targetCellIndex === null) {
      return { x: 0, y: 0 };
    }
    const currentIndex = this.navigationCellFor(position);
    if (
      currentIndex === null
      || currentIndex === this.targetCellIndex
      || !Number.isFinite(this.distances[currentIndex])
    ) {
      return normalizedDirection(position, this.latestTarget);
    }

    const nextIndex = this.neighbors(currentIndex)
      .filter((index) => this.walkable[index])
      .filter((index) => this.distances[index]! + COST_EPSILON < this.distances[currentIndex]!)
      .sort((left, right) => (
        this.distances[left]! - this.distances[right]! || left - right
      ))[0];
    if (nextIndex === undefined) {
      return normalizedDirection(position, this.latestTarget);
    }
    return normalizedDirection(position, this.cells[nextIndex]!.center);
  }

  distanceFrom(position: Point): number {
    assertFinitePoint(position, 'Navigation position');
    if (this.latestTarget === null || this.targetCellIndex === null) {
      return Number.POSITIVE_INFINITY;
    }
    const currentIndex = this.navigationCellFor(position);
    if (currentIndex === null || !Number.isFinite(this.distances[currentIndex])) {
      return pointDistance(position, this.latestTarget);
    }
    if (currentIndex === this.targetCellIndex) {
      return pointDistance(position, this.latestTarget);
    }
    return pointDistance(position, this.cells[currentIndex]!.center)
      + this.distances[currentIndex]!
      + pointDistance(this.cells[this.targetCellIndex]!.center, this.latestTarget);
  }

  snapshot(): NavigationFieldSnapshot {
    const targetCell = this.targetCellIndex === null
      ? null
      : {
        x: this.cells[this.targetCellIndex]!.x,
        y: this.cells[this.targetCellIndex]!.y,
      };
    return {
      columns: this.columns,
      rows: this.rows,
      revision: this.revision,
      recomputeCount: this.recomputeCount,
      targetCell,
    };
  }

  reset(): void {
    this.distances.fill(Number.POSITIVE_INFINITY);
    this.targetCellIndex = null;
    this.latestTarget = null;
    this.lastRecomputeTarget = null;
    this.elapsedSinceRecomputeMs = 0;
    this.revision = 0;
    this.recomputeCount = 0;
  }

  private recompute(targetCellIndex: number): void {
    this.targetCellIndex = targetCellIndex;
    this.distances.fill(Number.POSITIVE_INFINITY);
    this.distances[targetCellIndex] = 0;
    const queue = new MinQueue();
    queue.push({ index: targetCellIndex, distance: 0 });

    while (queue.size > 0) {
      const current = queue.pop()!;
      if (current.distance > this.distances[current.index]! + COST_EPSILON) continue;
      for (const neighbor of this.neighbors(current.index)) {
        if (!this.walkable[neighbor]) continue;
        const from = this.cells[current.index]!;
        const to = this.cells[neighbor]!;
        const diagonal = from.x !== to.x && from.y !== to.y;
        const candidate = current.distance
          + this.cellSize * (diagonal ? Math.SQRT2 : 1);
        if (candidate + COST_EPSILON >= this.distances[neighbor]!) continue;
        this.distances[neighbor] = candidate;
        queue.push({ index: neighbor, distance: candidate });
      }
    }
  }

  private navigationCellFor(position: Point): number | null {
    const direct = this.cellIndexAt(position);
    if (this.walkable[direct]) return direct;
    return this.nearestWalkableCell(position);
  }

  private cellIndexAt(position: Point): number {
    const x = Math.max(0, Math.min(this.columns - 1, Math.floor(position.x / this.cellSize)));
    const y = Math.max(0, Math.min(this.rows - 1, Math.floor(position.y / this.cellSize)));
    return y * this.columns + x;
  }

  private nearestWalkableCell(position: Point): number | null {
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cell of this.cells) {
      if (!this.walkable[cell.index]) continue;
      const dx = cell.center.x - position.x;
      const dy = cell.center.y - position.y;
      const candidate = dx * dx + dy * dy;
      if (
        candidate + COST_EPSILON < bestDistance
        || (Math.abs(candidate - bestDistance) <= COST_EPSILON
          && (bestIndex === null || cell.index < bestIndex))
      ) {
        bestDistance = candidate;
        bestIndex = cell.index;
      }
    }
    return bestIndex;
  }

  private neighbors(index: number): readonly number[] {
    const cell = this.cells[index]!;
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || x >= this.columns || y < 0 || y >= this.rows) continue;
        result.push(y * this.columns + x);
      }
    }
    return result.sort((left, right) => left - right);
  }
}

class MinQueue {
  private readonly entries: QueueEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(entry: QueueEntry): void {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareEntries(this.entries[parent]!, entry) <= 0) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): QueueEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (first === undefined || last === undefined || this.entries.length === 0) {
      return first;
    }
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const child = right < this.entries.length
        && compareEntries(this.entries[right]!, this.entries[left]!) < 0
        ? right
        : left;
      if (compareEntries(last, this.entries[child]!) <= 0) break;
      this.entries[index] = this.entries[child]!;
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

function compareEntries(left: QueueEntry, right: QueueEntry): number {
  return left.distance - right.distance || left.index - right.index;
}

function validatePath(path: readonly PathWaypoint[], pathIndex: number): void {
  if (path.length < 2) {
    throw new RangeError(`Navigation path ${pathIndex} needs at least two waypoints`);
  }
  path.forEach((waypoint, waypointIndex) => {
    if (
      !Array.isArray(waypoint)
      || waypoint.length !== 2
      || !Number.isFinite(waypoint[0])
      || !Number.isFinite(waypoint[1])
    ) {
      throw new RangeError(`Invalid navigation waypoint ${pathIndex}:${waypointIndex}`);
    }
  });
}

function waypointPoint(waypoint: PathWaypoint): Point {
  return { x: waypoint[0], y: waypoint[1] };
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, from);
  const ratio = Math.max(0, Math.min(
    1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
  ));
  return pointDistance(point, {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  });
}

function pointDistance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalizedDirection(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertFinitePoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}
