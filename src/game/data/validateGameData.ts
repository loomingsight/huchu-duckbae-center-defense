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
const REQUIRED_WAVES = [1, 2, 3, 4, 5] as const;
const REQUIRED_PATH_SET = new Set<string>(REQUIRED_PATHS);
const REQUIRED_WAVE_SET = new Set<number>(REQUIRED_WAVES);
const BOSS_BY_WAVE = new Map<number, EnemyKind>([
  [3, 'dogTrader'],
  [5, 'illegalBreeder'],
]);

const isBoss = (kind: EnemyKind): boolean => (
  kind === 'dogTrader' || kind === 'illegalBreeder'
);

type RegularKind = Extract<EnemyKind, 'poopGuardian' | 'offLeashGuardian'>;

const isRegular = (kind: EnemyKind): kind is RegularKind => (
  kind === 'poopGuardian' || kind === 'offLeashGuardian'
);

export function validateGameData({ paths, waves }: GameDataInput): readonly string[] {
  const errors: string[] = [];

  for (const pathId of REQUIRED_PATHS) {
    if (paths[pathId] === undefined) {
      errors.push(`path ${pathId}: missing`);
    }
  }

  for (const pathId of Object.keys(paths)) {
    if (!REQUIRED_PATH_SET.has(pathId)) {
      errors.push(`path ${pathId}: unexpected`);
    }
  }

  for (const [pathId, points] of Object.entries(paths)) {
    if (points.length < 2) {
      errors.push(`path ${pathId}: needs at least two waypoints`);
    }
    points.forEach(([x, y], index) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        errors.push(`path ${pathId}[${index}]: waypoint coordinates must be finite`);
      } else if (x < 0 || x > 540 || y < 0 || y > 960) {
        errors.push(`path ${pathId}[${index}]: waypoint (${x},${y}) is outside 540x960`);
      }
    });
    for (let index = 1; index < points.length; index += 1) {
      const [startX, startY] = points[index - 1]!;
      const [endX, endY] = points[index]!;
      const segmentLength = Math.hypot(endX - startX, endY - startY);
      if (!Number.isFinite(segmentLength) || segmentLength <= 0) {
        errors.push(
          `path ${pathId} segment ${index - 1}-${index}: length must be finite and greater than zero`,
        );
      }
    }
  }

  if (waves.length !== REQUIRED_WAVES.length) {
    errors.push(`waves: expected exactly 5, received ${waves.length}`);
  }

  const waveCounts = new Map<number, number>();
  for (const wave of waves) {
    waveCounts.set(wave.wave, (waveCounts.get(wave.wave) ?? 0) + 1);
    if (!REQUIRED_WAVE_SET.has(wave.wave)) {
      errors.push(`wave ${wave.wave}: unexpected`);
    }
  }
  for (const waveNumber of REQUIRED_WAVES) {
    const count = waveCounts.get(waveNumber) ?? 0;
    if (count === 0) {
      errors.push(`wave ${waveNumber}: missing`);
    } else if (count > 1) {
      errors.push(`wave ${waveNumber}: duplicate`);
    }
  }

  const variantCursor: Record<RegularKind, number> = {
    poopGuardian: 0,
    offLeashGuardian: 0,
  };
  waves.forEach((wave, waveIndex) => {
    const expectedWave = REQUIRED_WAVES[waveIndex];
    if (expectedWave !== undefined && wave.wave !== expectedWave) {
      errors.push(`waves[${waveIndex}]: expected wave ${expectedWave}, received ${wave.wave}`);
    }

    const label = `wave ${wave.wave}`;
    if (wave.spawns.length > 60) {
      errors.push(`${label}: ${wave.spawns.length} exceeds enemy cap 60`);
    }

    let previousAtMs: number | undefined;
    const pathsAtTime = new Map<number, Set<string>>();
    for (const [spawnIndex, spawn] of wave.spawns.entries()) {
      const validAtMs = Number.isFinite(spawn.atMs) && spawn.atMs >= 0;
      if (!validAtMs) {
        errors.push(`${label}[${spawnIndex}]: atMs must be finite and non-negative`);
      } else {
        if (previousAtMs !== undefined && spawn.atMs < previousAtMs) {
          errors.push(`${label}[${spawnIndex}]: atMs is not ascending`);
        }
        previousAtMs = spawn.atMs;
      }

      if (!REQUIRED_PATH_SET.has(spawn.pathId)) {
        errors.push(`${label}[${spawnIndex}]: unknown path ${spawn.pathId}`);
      }

      if (validAtMs) {
        const used = pathsAtTime.get(spawn.atMs) ?? new Set<string>();
        if (used.has(spawn.pathId)) {
          errors.push(`${label}[${spawnIndex}]: duplicate path ${spawn.pathId} at ${spawn.atMs}ms`);
        }
        used.add(spawn.pathId);
        pathsAtTime.set(spawn.atMs, used);
      }

      if (isBoss(spawn.kind)) {
        if (spawn.pathId !== 'P3') {
          errors.push(`${label}[${spawnIndex}]: boss must use P3`);
        }
        if (BOSS_BY_WAVE.get(wave.wave) !== spawn.kind) {
          errors.push(`${label}[${spawnIndex}]: invalid boss ${spawn.kind}`);
        }
      }

      if (isRegular(spawn.kind)) {
        const expectedVariant: EnemyVariant = variantCursor[spawn.kind]++ % 2 === 0
          ? 'male'
          : 'female';
        if (spawn.variant === 'seeded') {
          errors.push(`${label}[${spawnIndex}]: ${spawn.kind} cannot use seeded variant`);
        }
        if (spawn.variant !== expectedVariant) {
          errors.push(`${label}[${spawnIndex}]: expected ${expectedVariant} variant for ${spawn.kind}`);
        }
      } else if (spawn.kind === 'dogTrader' && spawn.variant !== 'male') {
        errors.push(`${label}[${spawnIndex}]: dogTrader variant must be male`);
      } else if (spawn.kind === 'illegalBreeder' && spawn.variant !== 'seeded') {
        errors.push(`${label}[${spawnIndex}]: illegalBreeder variant must be seeded`);
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
