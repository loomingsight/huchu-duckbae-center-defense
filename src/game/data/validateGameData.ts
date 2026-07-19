import type { EnemyKind, EnemyVariant } from '../types/GameTypes';

type RawSpawn = {
  readonly atMs: number;
  readonly pathId: string;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant | 'seeded';
};

type RawWave = {
  readonly wave: number;
  readonly spawns: readonly RawSpawn[];
};

export type GameDataInput = {
  readonly paths: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly waves: readonly RawWave[];
};

const REQUIRED_PATHS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const BOSS_BY_WAVE = new Map<number, EnemyKind>([
  [3, 'dogTrader'],
  [5, 'illegalBreeder'],
]);

const isBoss = (kind: EnemyKind): boolean => (
  kind === 'dogTrader' || kind === 'illegalBreeder'
);

export function validateGameData({ paths, waves }: GameDataInput): readonly string[] {
  const errors: string[] = [];

  for (const pathId of REQUIRED_PATHS) {
    if (paths[pathId] === undefined) {
      errors.push(`path ${pathId}: missing`);
    }
  }

  for (const [pathId, points] of Object.entries(paths)) {
    if (points.length < 2) {
      errors.push(`path ${pathId}: needs at least two waypoints`);
    }
    points.forEach(([x, y], index) => {
      if (x < 0 || x > 540 || y < 0 || y > 960) {
        errors.push(`path ${pathId}[${index}]: waypoint (${x},${y}) is outside 540x960`);
      }
    });
  }

  waves.forEach((wave, waveIndex) => {
    const label = `wave ${wave.wave || waveIndex + 1}`;
    if (wave.spawns.length > 60) {
      errors.push(`${label}: ${wave.spawns.length} exceeds enemy cap 60`);
    }

    let previousAtMs = -1;
    const pathsAtTime = new Map<number, Set<string>>();
    for (const [spawnIndex, spawn] of wave.spawns.entries()) {
      if (spawn.atMs < previousAtMs) {
        errors.push(`${label}[${spawnIndex}]: atMs is not ascending`);
      }
      previousAtMs = spawn.atMs;

      if (paths[spawn.pathId] === undefined) {
        errors.push(`${label}[${spawnIndex}]: unknown path ${spawn.pathId}`);
      }

      const used = pathsAtTime.get(spawn.atMs) ?? new Set<string>();
      if (used.has(spawn.pathId)) {
        errors.push(`${label}[${spawnIndex}]: duplicate path ${spawn.pathId} at ${spawn.atMs}ms`);
      }
      used.add(spawn.pathId);
      pathsAtTime.set(spawn.atMs, used);

      if (isBoss(spawn.kind)) {
        if (spawn.pathId !== 'P3') {
          errors.push(`${label}[${spawnIndex}]: boss must use P3`);
        }
        if (BOSS_BY_WAVE.get(wave.wave) !== spawn.kind) {
          errors.push(`${label}[${spawnIndex}]: invalid boss ${spawn.kind}`);
        }
      }
    }

    const expectedBoss = BOSS_BY_WAVE.get(wave.wave);
    const bosses = wave.spawns.filter((spawn) => isBoss(spawn.kind));
    if (
      expectedBoss !== undefined
      && (bosses.length !== 1 || bosses.at(0)!.kind !== expectedBoss)
    ) {
      errors.push(`${label}: expected exactly one ${expectedBoss}`);
    }
  });

  return errors;
}
