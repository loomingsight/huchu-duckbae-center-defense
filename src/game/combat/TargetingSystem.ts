import type { EnemySnapshot } from '../enemies/EnemyTypes';
import { distance, type Point } from '../world/Geometry';

interface RankedTarget {
  readonly enemy: EnemySnapshot;
  readonly distanceToPlayer: number;
}

const ENEMY_STATES = new Set<string>([
  'moving',
  'windup',
  'holding',
  'stunned',
  'dead',
]);

export function compareThreat(left: RankedTarget, right: RankedTarget): number {
  return left.enemy.etaMs - right.enemy.etaMs
    || left.distanceToPlayer - right.distanceToPlayer
    || Number(right.enemy.isBoss) - Number(left.enemy.isBoss)
    || left.enemy.spawnSequence - right.enemy.spawnSequence;
}

export function selectThreatTarget(
  player: Point,
  enemies: readonly EnemySnapshot[],
  range = Number.POSITIVE_INFINITY,
): EnemySnapshot | undefined {
  return rankThreatTargets(player, enemies, range).at(0);
}

export function rankThreatTargets(
  player: Point,
  enemies: readonly EnemySnapshot[],
  range = Number.POSITIVE_INFINITY,
): readonly EnemySnapshot[] {
  assertPoint(player, 'Targeting player');
  assertRange(range);

  const ranked = enemies.map((enemy): RankedTarget => {
    assertCandidate(enemy);
    const distanceToPlayer = distance(player, enemy.position);
    if (!Number.isFinite(distanceToPlayer)) {
      throw new RangeError('Targeting distance must be finite');
    }
    return { enemy, distanceToPlayer };
  });

  return ranked
    .filter(({ enemy, distanceToPlayer }) => enemy.state !== 'dead' && distanceToPlayer <= range)
    .sort(compareThreat)
    .map(({ enemy }) => enemy);
}

function assertCandidate(enemy: EnemySnapshot): void {
  if (!Number.isSafeInteger(enemy.id) || enemy.id < 0) {
    throw new RangeError('Targeting enemy id must be a non-negative safe integer');
  }
  assertPoint(enemy.position, 'Targeting enemy position');
  assertFiniteNonNegative(enemy.etaMs, 'Targeting enemy etaMs');
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
