import type { EnemyKind, EnemyVariant, PathId } from '../types/GameTypes';
import type { ScheduledSpawn, WaveDefinition } from '../waves/WaveTypes';

type RegularKind = 'poopGuardian' | 'offLeashGuardian';

const variantCursor: Record<RegularKind, number> = {
  poopGuardian: 0,
  offLeashGuardian: 0,
};

const regular = (atMs: number, pathId: PathId, kind: RegularKind): ScheduledSpawn => {
  const variant: EnemyVariant = variantCursor[kind]++ % 2 === 0 ? 'male' : 'female';
  return { atMs, pathId, kind, variant };
};

const boss = (
  atMs: number,
  pathId: 'P3',
  kind: Extract<EnemyKind, 'dogTrader' | 'illegalBreeder'>,
): ScheduledSpawn => ({
  atMs,
  pathId,
  kind,
  variant: kind === 'illegalBreeder' ? 'seeded' : 'male',
});

const w1Paths = ['P1', 'P2'] as const;
const w2Paths = ['P1', 'P2', 'P3', 'P4'] as const;
const w2Kinds = [
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'poopGuardian',
] as const;
const w3Paths = ['P2', 'P4', 'P6'] as const;
const w4Paths = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const w5Paths = ['P1', 'P2', 'P5', 'P6'] as const;

const w4 = Array.from({ length: 9 }, (_, event) => {
  const kinds = event < 8
    ? (['poopGuardian', 'offLeashGuardian'] as const)
    : (['offLeashGuardian', 'offLeashGuardian'] as const);
  return kinds.map((kind, slot) => regular(
    event * 1100,
    w4Paths[(event * 2 + slot) % w4Paths.length]!,
    kind,
  ));
}).flat();

const w5Regular = Array.from({ length: 7 }, (_, event) => {
  const kinds = event < 6
    ? (['poopGuardian', 'offLeashGuardian'] as const)
    : (['offLeashGuardian', 'offLeashGuardian'] as const);
  return kinds.map((kind, slot) => regular(
    event * 1100,
    w5Paths[(event * 2 + slot) % w5Paths.length]!,
    kind,
  ));
}).flat();

export const WAVE_DEFINITIONS = [
  {
    wave: 1,
    spawns: Array.from({ length: 10 }, (_, index) => regular(
      index * 1000,
      w1Paths[index % w1Paths.length]!,
      'poopGuardian',
    )),
  },
  {
    wave: 2,
    spawns: w2Kinds.map((kind, index) => regular(
      index * 900,
      w2Paths[index % w2Paths.length]!,
      kind,
    )),
  },
  {
    wave: 3,
    spawns: [
      ...Array.from({ length: 6 }, (_, index) => regular(
        index * 1000,
        w3Paths[index % w3Paths.length]!,
        'offLeashGuardian',
      )),
      boss(7000, 'P3', 'dogTrader'),
    ],
  },
  { wave: 4, spawns: w4 },
  { wave: 5, spawns: [...w5Regular, boss(8600, 'P3', 'illegalBreeder')] },
] as const satisfies readonly WaveDefinition[];
