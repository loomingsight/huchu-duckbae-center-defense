import type { EnemySnapshot } from '../enemies/EnemyTypes';
import { distance, type Point } from '../world/Geometry';

export interface RankedTarget {
  readonly enemy: EnemySnapshot;
  readonly distanceToOrigin: number;
}

const ENEMY_STATES = new Set<string>(['moving', 'windup', 'holding', 'dead']);

export function compareThreat(left: RankedTarget, right: RankedTarget): number {
  return compareThreatValues(
    left.enemy,
    left.distanceToOrigin,
    right.enemy,
    right.distanceToOrigin,
  );
}

export function selectThreatTarget(
  origin: Point,
  enemies: readonly EnemySnapshot[],
  range = Number.POSITIVE_INFINITY,
): EnemySnapshot | undefined {
  assertPoint(origin, 'Targeting origin');
  let selected: EnemySnapshot | undefined;
  let selectedDistance = 0;
  for (const enemy of enemies) {
    const distanceToOrigin = candidateDistance(origin, enemy);
    if (enemy.state === 'dead' || distanceToOrigin > range) continue;
    if (
      selected === undefined
      || compareThreatValues(enemy, distanceToOrigin, selected, selectedDistance) < 0
    ) {
      selected = enemy;
      selectedDistance = distanceToOrigin;
    }
  }
  assertRange(range);
  return selected;
}

export function rankThreatTargets(
  origin: Point,
  enemies: readonly EnemySnapshot[],
  range = Number.POSITIVE_INFINITY,
): readonly RankedTarget[] {
  const ranked = rankedCandidates(origin, enemies);
  assertRange(range);
  return ranked
    .filter(({ enemy, distanceToOrigin }) => enemy.state !== 'dead' && distanceToOrigin <= range)
    .sort(compareThreat);
}

export function rankHighestHpTargets(
  origin: Point,
  enemies: readonly EnemySnapshot[],
): readonly RankedTarget[] {
  return rankedCandidates(origin, enemies)
    .filter(({ enemy }) => enemy.state !== 'dead')
    .sort(compareHighestHp);
}

export function selectHighestHpTarget(
  origin: Point,
  enemies: readonly EnemySnapshot[],
): EnemySnapshot | undefined {
  assertPoint(origin, 'Targeting origin');
  let selected: EnemySnapshot | undefined;
  let selectedDistance = 0;
  for (const enemy of enemies) {
    const distanceToOrigin = candidateDistance(origin, enemy);
    if (enemy.state === 'dead') continue;
    if (
      selected === undefined
      || compareHighestHpValues(enemy, distanceToOrigin, selected, selectedDistance) < 0
    ) {
      selected = enemy;
      selectedDistance = distanceToOrigin;
    }
  }
  return selected;
}

export function validateTargetingCandidates(
  origin: Point,
  enemies: readonly EnemySnapshot[],
): void {
  assertPoint(origin, 'Targeting origin');
  for (const enemy of enemies) {
    candidateDistance(origin, enemy);
  }
}

export function inCone(
  origin: Point,
  direction: Point,
  target: Point,
  radius: number,
  angleDeg: number,
): boolean {
  assertPoint(origin, 'Cone origin');
  assertPoint(direction, 'Cone direction');
  assertPoint(target, 'Cone target');
  assertFiniteNonNegative(radius, 'Cone radius');
  if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 360) {
    throw new RangeError('Cone angleDeg must be finite from 0 to 360');
  }
  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength === 0) throw new RangeError('Cone direction must be non-zero');

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  const cosine = (dx * direction.x + dy * direction.y) / (length * directionLength);
  return length <= radius + 1e-9
    && (length === 0 || cosine >= Math.cos(angleDeg * Math.PI / 360) - 1e-9);
}

function rankedCandidates(
  origin: Point,
  enemies: readonly EnemySnapshot[],
): RankedTarget[] {
  assertPoint(origin, 'Targeting origin');
  return enemies.map((enemy): RankedTarget => {
    return { enemy, distanceToOrigin: candidateDistance(origin, enemy) };
  });
}

function isAttacking(enemy: EnemySnapshot): boolean {
  return enemy.state === 'windup' || enemy.state === 'holding';
}

function compareHighestHp(left: RankedTarget, right: RankedTarget): number {
  return compareHighestHpValues(
    left.enemy,
    left.distanceToOrigin,
    right.enemy,
    right.distanceToOrigin,
  );
}

function compareHighestHpValues(
  left: EnemySnapshot,
  leftDistance: number,
  right: EnemySnapshot,
  rightDistance: number,
): number {
  return right.currentHp - left.currentHp
    || Number(right.isBoss) - Number(left.isBoss)
    || compareThreatValues(left, leftDistance, right, rightDistance);
}

function compareThreatValues(
  left: EnemySnapshot,
  leftDistance: number,
  right: EnemySnapshot,
  rightDistance: number,
): number {
  return left.etaMs - right.etaMs
    || Number(isAttacking(right)) - Number(isAttacking(left))
    || Number(right.isBoss) - Number(left.isBoss)
    || leftDistance - rightDistance
    || left.spawnSequence - right.spawnSequence
    || left.id - right.id;
}

function candidateDistance(origin: Point, enemy: EnemySnapshot): number {
  assertCandidate(enemy);
  const distanceToOrigin = distance(origin, enemy.position);
  if (!Number.isFinite(distanceToOrigin)) {
    throw new RangeError('Targeting distance must be finite');
  }
  return distanceToOrigin;
}

function assertCandidate(enemy: EnemySnapshot): void {
  if (!Number.isSafeInteger(enemy.id) || enemy.id < 0) {
    throw new RangeError('Targeting enemy id must be a non-negative safe integer');
  }
  assertPoint(enemy.position, 'Targeting enemy position');
  assertFiniteNonNegative(enemy.etaMs, 'Targeting enemy etaMs');
  assertFiniteNonNegative(enemy.currentHp, 'Targeting enemy currentHp');
  if (!Number.isSafeInteger(enemy.spawnSequence) || enemy.spawnSequence < 0) {
    throw new RangeError('Targeting enemy spawnSequence must be a non-negative safe integer');
  }
  if (typeof enemy.isBoss !== 'boolean') {
    throw new RangeError('Targeting enemy isBoss must be boolean');
  }
  if (!ENEMY_STATES.has(enemy.state)) {
    throw new RangeError(`Unknown targeting enemy state ${String(enemy.state)}`);
  }
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

function assertRange(range: number): void {
  if (
    typeof range !== 'number'
    || range < 0
    || (!Number.isFinite(range) && range !== Number.POSITIVE_INFINITY)
  ) {
    throw new RangeError('Targeting range must be non-negative or positive infinity');
  }
}
