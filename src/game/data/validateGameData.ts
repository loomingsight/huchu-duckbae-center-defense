import type { BossKind, SpawnGroup } from '../waves/WaveTypes';

type RawWave = {
  readonly wave: unknown;
  readonly pathIds: unknown;
  readonly groups: unknown;
};

export type GameDataInput = {
  readonly paths: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly waves: readonly RawWave[];
};

const REQUIRED_PATHS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const REQUIRED_WAVES = [1, 2, 3, 4, 5] as const;
const REQUIRED_PATH_SET = new Set<string>(REQUIRED_PATHS);
const REQUIRED_WAVE_SET = new Set<number>(REQUIRED_WAVES);

const EXPECTED_PATHS: Readonly<Record<number, readonly string[]>> = {
  1: ['P1', 'P2'],
  2: ['P1', 'P2', 'P3', 'P4'],
  3: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  4: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  5: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
};

const EXPECTED_GROUPS: Readonly<Record<number, readonly SpawnGroup[]>> = {
  1: [[0, 2, 0], [7, 2, 0], [14, 2, 0], [21, 2, 0], [28, 2, 0]],
  2: [[0, 1, 1], [7, 1, 1], [14, 1, 1], [21, 1, 1], [28, 1, 1], [35, 1, 1], [42, 0, 2]],
  3: [[0, 1, 2], [8, 2, 1], [16, 1, 2], [24, 1, 2], [32, 2, 1], [40, 1, 2]],
  4: [[0, 2, 2], [12, 1, 2], [24, 1, 2], [32, 0, 0, 'dogTrader']],
  5: [[0, 2, 2], [12, 1, 2], [24, 1, 2], [32, 0, 0, 'illegalBreeder'], [42, 2, 2]],
};

const EXPECTED_BOSS: Readonly<Partial<Record<number, BossKind>>> = {
  4: 'dogTrader',
  5: 'illegalBreeder',
};

const isBossKind = (value: unknown): value is BossKind => (
  value === 'dogTrader' || value === 'illegalBreeder'
);

const isNonNegativeSafeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const exactArray = (actual: readonly unknown[], expected: readonly unknown[]): boolean => (
  actual.length === expected.length
  && actual.every((value, index) => value === expected[index])
);

export function validateGameData({ paths, waves }: GameDataInput): readonly string[] {
  const errors: string[] = [];
  validatePaths(paths, errors);
  validateWaves(waves, errors);
  return errors;
}

function validatePaths(
  paths: GameDataInput['paths'],
  errors: string[],
): void {
  for (const pathId of REQUIRED_PATHS) {
    if (paths[pathId] === undefined) errors.push(`path ${pathId}: missing`);
  }

  for (const pathId of Object.keys(paths)) {
    if (!REQUIRED_PATH_SET.has(pathId)) errors.push(`path ${pathId}: unexpected`);
  }

  for (const [pathId, points] of Object.entries(paths)) {
    if (points.length < 2) errors.push(`path ${pathId}: needs at least two waypoints`);
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
}

function validateWaves(waves: readonly RawWave[], errors: string[]): void {
  if (waves.length !== REQUIRED_WAVES.length) {
    errors.push(`waves: expected exactly 5, received ${waves.length}`);
  }

  const waveCounts = new Map<number, number>();
  for (const wave of waves) {
    if (typeof wave.wave !== 'number' || !Number.isSafeInteger(wave.wave)) continue;
    waveCounts.set(wave.wave, (waveCounts.get(wave.wave) ?? 0) + 1);
    if (!REQUIRED_WAVE_SET.has(wave.wave)) errors.push(`wave ${wave.wave}: unexpected`);
  }
  for (const waveNumber of REQUIRED_WAVES) {
    const count = waveCounts.get(waveNumber) ?? 0;
    if (count === 0) errors.push(`wave ${waveNumber}: missing`);
    else if (count > 1) errors.push(`wave ${waveNumber}: duplicate`);
  }

  waves.forEach((wave, waveIndex) => validateWave(wave, waveIndex, errors));
}

function validateWave(wave: RawWave, waveIndex: number, errors: string[]): void {
  const expectedWave = REQUIRED_WAVES[waveIndex];
  if (typeof wave.wave !== 'number' || !Number.isSafeInteger(wave.wave)) {
    errors.push(`waves[${waveIndex}]: wave must be a safe integer`);
    return;
  }
  if (expectedWave !== undefined && wave.wave !== expectedWave) {
    errors.push(`waves[${waveIndex}]: expected wave ${expectedWave}, received ${wave.wave}`);
  }

  const label = `wave ${wave.wave}`;
  const pathIds = validateWavePaths(wave.pathIds, wave.wave, label, errors);
  validateWaveGroups(wave.groups, wave.wave, label, new Set(pathIds).size, errors);
}

function validateWavePaths(
  rawPathIds: unknown,
  waveNumber: number,
  label: string,
  errors: string[],
): readonly string[] {
  if (!Array.isArray(rawPathIds)) {
    errors.push(`${label}: pathIds must be an array`);
    return [];
  }

  const pathIds: string[] = [];
  const used = new Set<string>();
  rawPathIds.forEach((pathId, index) => {
    if (typeof pathId !== 'string') {
      errors.push(`${label} pathIds[${index}]: path id must be a string`);
      return;
    }
    pathIds.push(pathId);
    if (!REQUIRED_PATH_SET.has(pathId)) errors.push(`${label}: unknown path ${pathId}`);
    if (used.has(pathId)) errors.push(`${label}: duplicate path ${pathId}`);
    used.add(pathId);
  });

  const expected = EXPECTED_PATHS[waveNumber];
  if (expected !== undefined && !exactArray(pathIds, expected)) {
    errors.push(`${label}: expected path set ${expected.join(',')}`);
  }
  return pathIds;
}

function validateWaveGroups(
  rawGroups: unknown,
  waveNumber: number,
  label: string,
  uniquePathCount: number,
  errors: string[],
): void {
  if (!Array.isArray(rawGroups)) {
    errors.push(`${label}: groups must be an array`);
    return;
  }

  const expectedGroups = EXPECTED_GROUPS[waveNumber];
  if (expectedGroups !== undefined && rawGroups.length !== expectedGroups.length) {
    errors.push(`${label}: expected exactly ${expectedGroups.length} groups`);
  }

  let previousSeconds: number | undefined;
  const bosses: BossKind[] = [];
  rawGroups.forEach((rawGroup, groupIndex) => {
    const groupLabel = `${label} group ${groupIndex}`;
    if (!Array.isArray(rawGroup)) {
      errors.push(`${groupLabel}: group must be an array`);
      return;
    }
    if (rawGroup.length !== 3 && rawGroup.length !== 4) {
      errors.push(`${groupLabel}: expected tuple length 3 or 4`);
    }

    const [seconds, poopCount, offLeashCount, rawBoss] = rawGroup;
    const validSeconds = typeof seconds === 'number'
      && Number.isFinite(seconds)
      && seconds >= 0;
    if (!validSeconds) {
      errors.push(`${groupLabel}: seconds must be finite and non-negative`);
    } else {
      if (previousSeconds !== undefined && seconds <= previousSeconds) {
        errors.push(`${groupLabel}: seconds must be ascending`);
      }
      previousSeconds = seconds;
    }

    if (!isNonNegativeSafeInteger(poopCount)) {
      errors.push(`${groupLabel}: poopGuardian count must be a non-negative safe integer`);
    }
    if (!isNonNegativeSafeInteger(offLeashCount)) {
      errors.push(`${groupLabel}: offLeashGuardian count must be a non-negative safe integer`);
    }

    let bossCount = 0;
    if (rawGroup.length === 4) {
      if (!isBossKind(rawBoss)) {
        errors.push(`${groupLabel}: invalid boss ${String(rawBoss)}`);
      } else {
        bosses.push(rawBoss);
        bossCount = 1;
        if (EXPECTED_BOSS[waveNumber] !== rawBoss) {
          errors.push(`${groupLabel}: invalid boss ${rawBoss}`);
        }
      }
    }

    if (isNonNegativeSafeInteger(poopCount) && isNonNegativeSafeInteger(offLeashCount)) {
      const eventCount = poopCount + offLeashCount + bossCount;
      if (eventCount === 0) errors.push(`${groupLabel}: event must spawn at least one enemy`);
      if (eventCount > uniquePathCount) {
        errors.push(
          `${groupLabel}: event count ${eventCount} exceeds unique path count ${uniquePathCount}`,
        );
      }
    }

    const expected = expectedGroups?.[groupIndex];
    if (expected !== undefined && !exactArray(rawGroup, expected)) {
      errors.push(`${groupLabel}: expected ${expected.join(',')}`);
    } else if (expectedGroups !== undefined && expected === undefined) {
      errors.push(`${groupLabel}: unexpected`);
    }
  });

  const expectedBoss = EXPECTED_BOSS[waveNumber];
  if (
    expectedBoss !== undefined
    && (bosses.length !== 1 || bosses[0] !== expectedBoss)
  ) {
    errors.push(`${label}: expected exactly one ${expectedBoss}`);
  }
}
