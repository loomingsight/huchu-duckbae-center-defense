import { rankThreatTargets } from '../combat/TargetingSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import { clamp, type Point } from '../world/Geometry';

interface BucketEntry {
  readonly enemy: EnemySnapshot;
  readonly point: Point;
}

interface BucketGroup {
  readonly x: number;
  readonly y: number;
  readonly entries: BucketEntry[];
}

export function chooseHowlCenter(
  enemies: readonly EnemySnapshot[],
  bucketSize: number,
  bounds: { readonly width: number; readonly height: number },
): Point | undefined {
  assertPositiveFinite(bucketSize, 'Howl bucket size');
  assertPositiveFinite(bounds.width, 'Howl bounds width');
  assertPositiveFinite(bounds.height, 'Howl bounds height');
  rankThreatTargets({ x: 0, y: 0 }, enemies);

  const groups = new Map<string, BucketGroup>();
  for (const enemy of enemies) {
    if (enemy.state === 'dead') continue;
    const point = {
      x: clamp(enemy.position.x, 0, bounds.width),
      y: clamp(enemy.position.y, 0, bounds.height),
    };
    const x = Math.floor(point.x / bucketSize);
    const y = Math.floor(point.y / bucketSize);
    const key = `${x}:${y}`;
    const group = groups.get(key) ?? { x, y, entries: [] };
    group.entries.push({ enemy, point });
    groups.set(key, group);
  }

  const selected = [...groups.values()].sort(compareGroups).at(0);
  if (selected === undefined) return undefined;
  const entries = [...selected.entries].sort((left, right) => (
    left.enemy.spawnSequence - right.enemy.spawnSequence
    || left.enemy.id - right.enemy.id
  ));
  return {
    x: entries.reduce((sum, entry) => sum + entry.point.x, 0) / entries.length,
    y: entries.reduce((sum, entry) => sum + entry.point.y, 0) / entries.length,
  };
}

function compareGroups(left: BucketGroup, right: BucketGroup): number {
  return right.entries.length - left.entries.length
    || minimumEta(left) - minimumEta(right)
    || left.y - right.y
    || left.x - right.x;
}

function minimumEta(group: BucketGroup): number {
  return Math.min(...group.entries.map(({ enemy }) => enemy.etaMs));
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive`);
  }
}
