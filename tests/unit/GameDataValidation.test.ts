import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../src/game/data/balance';
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';
import { validateGameData } from '../../src/game/data/validateGameData';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import type { EnemyKind, EnemyVariant } from '../../src/game/types/GameTypes';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    WEBGL: 2,
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

type TestSpawn = {
  readonly atMs: number;
  readonly pathId: string;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant | 'seeded';
};

const makeSpawn = (overrides: Partial<TestSpawn> = {}): TestSpawn => ({
  atMs: 0,
  pathId: 'P1',
  kind: 'poopGuardian',
  variant: 'male',
  ...overrides,
});

const withSpawnVariant = (
  waveNumber: number,
  spawnIndex: number,
  variant: EnemyVariant | 'seeded',
) => WAVE_DEFINITIONS.map((wave) => ({
  wave: wave.wave,
  spawns: wave.spawns.map((spawn, index) => (
    wave.wave === waveNumber && index === spawnIndex ? { ...spawn, variant } : spawn
  )),
}));

const EXPECTED_WAVE_SCHEDULES = [
  [1, [
    [0, 'P1', 'poopGuardian', 'male'],
    [1000, 'P2', 'poopGuardian', 'female'],
    [2000, 'P1', 'poopGuardian', 'male'],
    [3000, 'P2', 'poopGuardian', 'female'],
    [4000, 'P1', 'poopGuardian', 'male'],
    [5000, 'P2', 'poopGuardian', 'female'],
    [6000, 'P1', 'poopGuardian', 'male'],
    [7000, 'P2', 'poopGuardian', 'female'],
    [8000, 'P1', 'poopGuardian', 'male'],
    [9000, 'P2', 'poopGuardian', 'female'],
  ]],
  [2, [
    [0, 'P1', 'poopGuardian', 'male'],
    [900, 'P2', 'offLeashGuardian', 'male'],
    [1800, 'P3', 'offLeashGuardian', 'female'],
    [2700, 'P4', 'poopGuardian', 'female'],
    [3600, 'P1', 'offLeashGuardian', 'male'],
    [4500, 'P2', 'offLeashGuardian', 'female'],
    [5400, 'P3', 'poopGuardian', 'male'],
    [6300, 'P4', 'offLeashGuardian', 'male'],
    [7200, 'P1', 'offLeashGuardian', 'female'],
    [8100, 'P2', 'poopGuardian', 'female'],
    [9000, 'P3', 'offLeashGuardian', 'male'],
    [9900, 'P4', 'offLeashGuardian', 'female'],
    [10800, 'P1', 'poopGuardian', 'male'],
    [11700, 'P2', 'poopGuardian', 'female'],
  ]],
  [3, [
    [0, 'P2', 'offLeashGuardian', 'male'],
    [1000, 'P4', 'offLeashGuardian', 'female'],
    [2000, 'P6', 'offLeashGuardian', 'male'],
    [3000, 'P2', 'offLeashGuardian', 'female'],
    [4000, 'P4', 'offLeashGuardian', 'male'],
    [5000, 'P6', 'offLeashGuardian', 'female'],
    [7000, 'P3', 'dogTrader', 'male'],
  ]],
  [4, [
    [0, 'P1', 'poopGuardian', 'male'],
    [0, 'P2', 'offLeashGuardian', 'male'],
    [1100, 'P3', 'poopGuardian', 'female'],
    [1100, 'P4', 'offLeashGuardian', 'female'],
    [2200, 'P5', 'poopGuardian', 'male'],
    [2200, 'P6', 'offLeashGuardian', 'male'],
    [3300, 'P1', 'poopGuardian', 'female'],
    [3300, 'P2', 'offLeashGuardian', 'female'],
    [4400, 'P3', 'poopGuardian', 'male'],
    [4400, 'P4', 'offLeashGuardian', 'male'],
    [5500, 'P5', 'poopGuardian', 'female'],
    [5500, 'P6', 'offLeashGuardian', 'female'],
    [6600, 'P1', 'poopGuardian', 'male'],
    [6600, 'P2', 'offLeashGuardian', 'male'],
    [7700, 'P3', 'poopGuardian', 'female'],
    [7700, 'P4', 'offLeashGuardian', 'female'],
    [8800, 'P5', 'offLeashGuardian', 'male'],
    [8800, 'P6', 'offLeashGuardian', 'female'],
  ]],
  [5, [
    [0, 'P1', 'poopGuardian', 'male'],
    [0, 'P2', 'offLeashGuardian', 'male'],
    [1100, 'P5', 'poopGuardian', 'female'],
    [1100, 'P6', 'offLeashGuardian', 'female'],
    [2200, 'P1', 'poopGuardian', 'male'],
    [2200, 'P2', 'offLeashGuardian', 'male'],
    [3300, 'P5', 'poopGuardian', 'female'],
    [3300, 'P6', 'offLeashGuardian', 'female'],
    [4400, 'P1', 'poopGuardian', 'male'],
    [4400, 'P2', 'offLeashGuardian', 'male'],
    [5500, 'P5', 'poopGuardian', 'female'],
    [5500, 'P6', 'offLeashGuardian', 'female'],
    [6600, 'P1', 'offLeashGuardian', 'male'],
    [6600, 'P2', 'offLeashGuardian', 'female'],
    [8600, 'P3', 'illegalBreeder', 'seeded'],
  ]],
] as const;

describe('고정 게임 데이터', () => {
  it('540x960 맵의 exact 6개 경로를 유지한다', () => {
    expect(PATH_DEFINITIONS).toEqual({
      P1: [[110, 0], [116, 75], [138, 159], [222, 214], [264, 265], [270, 350], [270, 430]],
      P2: [[430, 0], [424, 75], [402, 159], [318, 214], [276, 265], [270, 350], [270, 430]],
      P3: [[270, 0], [270, 110], [270, 220], [270, 340], [270, 430]],
      P4: [[0, 482], [90, 482], [170, 445], [220, 420], [240, 447], [220, 480]],
      P5: [[540, 482], [450, 482], [370, 445], [320, 420], [300, 447], [320, 480]],
      P6: [[270, 960], [270, 875], [270, 790], [270, 704], [270, 625], [270, 530]],
    });
  });

  it('MVP 밸런스 상수를 단일 데이터로 고정한다', () => {
    expect(BALANCE).toEqual({
      shelter: { maxHp: 100, x: 270, y: 480, hitRadius: 38 },
      player: { speed: 150, height: 72 },
      snackThresholds: [8, 22, 40, 62, 88],
      pendingSkillCombatDelayMs: 5000,
      waveCountdownMs: 3000,
      attackReleaseMs: 250,
      enemies: {
        poopGuardian: {
          hp: 35,
          speed: 44,
          damage: 3,
          attackIntervalMs: 1800,
          range: 48,
          snack: 1,
        },
        offLeashGuardian: {
          hp: 65,
          speed: 38,
          damage: 6,
          attackIntervalMs: 1600,
          range: 32,
          snack: 2,
        },
        dogTrader: {
          hp: 600,
          speed: 25,
          damage: 14,
          attackIntervalMs: 2200,
          range: 64,
          snack: 12,
        },
        illegalBreeder: {
          hp: 1000,
          speed: 23,
          damage: 18,
          attackIntervalMs: 2000,
          range: 88,
          snack: 20,
        },
      },
      caps: { enemies: 60, projectiles: 80, particles: 120 },
    });
  });

  it('W1과 W2의 경로, 종류, 시간표를 정확히 펼친다', () => {
    const [wave1, wave2] = WAVE_DEFINITIONS;

    expect(wave1.wave).toBe(1);
    expect(wave1.spawns).toHaveLength(10);
    expect(wave1.spawns.map(({ atMs, pathId, kind }) => ({ atMs, pathId, kind }))).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        atMs: index * 1000,
        pathId: index % 2 === 0 ? 'P1' : 'P2',
        kind: 'poopGuardian',
      })),
    );

    expect(wave2.wave).toBe(2);
    expect(wave2.spawns.map(({ kind }) => kind)).toEqual([
      'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
      'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
      'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
      'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
      'poopGuardian', 'poopGuardian',
    ]);
    expect(wave2.spawns.map(({ atMs }) => atMs)).toEqual(
      Array.from({ length: 14 }, (_, index) => index * 900),
    );
    expect(wave2.spawns.map(({ pathId }) => pathId)).toEqual(
      Array.from({ length: 14 }, (_, index) => ['P1', 'P2', 'P3', 'P4'][index % 4]),
    );
  });

  it('W3~W5의 묶음 생성과 보스 시간표를 정확히 펼친다', () => {
    const [, , wave3, wave4, wave5] = WAVE_DEFINITIONS;

    expect(wave3.spawns.slice(0, 6).map(({ atMs, pathId, kind }) => ({ atMs, pathId, kind })))
      .toEqual(Array.from({ length: 6 }, (_, index) => ({
        atMs: index * 1000,
        pathId: ['P2', 'P4', 'P6'][index % 3],
        kind: 'offLeashGuardian',
      })));
    expect(wave3.spawns.at(-1)).toEqual({
      atMs: 7000,
      pathId: 'P3',
      kind: 'dogTrader',
      variant: 'male',
    });

    expect(wave4.spawns).toHaveLength(18);
    expect(wave4.spawns.map(({ atMs }) => atMs)).toEqual(
      Array.from({ length: 9 }, (_, event) => [event * 1100, event * 1100]).flat(),
    );
    expect(wave4.spawns.slice(0, 16).map(({ kind }) => kind)).toEqual(
      Array.from({ length: 8 }, () => ['poopGuardian', 'offLeashGuardian']).flat(),
    );
    expect(wave4.spawns.slice(-2).map(({ kind }) => kind)).toEqual([
      'offLeashGuardian',
      'offLeashGuardian',
    ]);

    expect(wave5.spawns).toHaveLength(15);
    expect(wave5.spawns.slice(0, 12).map(({ kind }) => kind)).toEqual(
      Array.from({ length: 6 }, () => ['poopGuardian', 'offLeashGuardian']).flat(),
    );
    expect(wave5.spawns.slice(12, 14).map(({ kind }) => kind)).toEqual([
      'offLeashGuardian',
      'offLeashGuardian',
    ]);
    expect(wave5.spawns.at(-1)).toEqual({
      atMs: 8600,
      pathId: 'P3',
      kind: 'illegalBreeder',
      variant: 'seeded',
    });
  });

  it('동시 생성은 서로 다른 경로를 쓰고 일반 적 variant는 종류별로 교대한다', () => {
    for (const wave of WAVE_DEFINITIONS) {
      const pathsByTime = new Map<number, Set<string>>();
      for (const spawn of wave.spawns) {
        const used = pathsByTime.get(spawn.atMs) ?? new Set<string>();
        expect(used.has(spawn.pathId)).toBe(false);
        used.add(spawn.pathId);
        pathsByTime.set(spawn.atMs, used);
      }
    }

    for (const kind of ['poopGuardian', 'offLeashGuardian'] as const) {
      const variants = WAVE_DEFINITIONS
        .flatMap(({ spawns }) => [...spawns])
        .filter((spawn) => spawn.kind === kind)
        .map(({ variant }) => variant);
      expect(variants).toEqual(
        variants.map((_, index) => (index % 2 === 0 ? 'male' : 'female')),
      );
    }
  });

  it('W1부터 W5까지 모든 spawn tuple과 boss gap을 exact schedule로 고정한다', () => {
    expect(WAVE_DEFINITIONS.map(({ wave, spawns }) => [wave, spawns.length])).toEqual([
      [1, 10],
      [2, 14],
      [3, 7],
      [4, 18],
      [5, 15],
    ]);
    expect(WAVE_DEFINITIONS.map(({ wave, spawns }) => [
      wave,
      spawns.map(({ atMs, pathId, kind, variant }) => [atMs, pathId, kind, variant]),
    ])).toEqual(EXPECTED_WAVE_SCHEDULES);

    const wave3 = WAVE_DEFINITIONS[2].spawns;
    const wave5 = WAVE_DEFINITIONS[4].spawns;
    expect(wave3.at(-1)!.atMs - wave3.at(-2)!.atMs).toBe(2000);
    expect(wave5.at(-1)!.atMs - wave5.at(-2)!.atMs).toBe(2000);
  });
});

describe('validateGameData', () => {
  it('맵 밖 웨이포인트와 알 수 없는 경로를 모두 보고한다', () => {
    const errors = validateGameData({
      paths: { ...PATH_DEFINITIONS, P1: [[-1, 0], [270, 430]] },
      waves: [
        {
          wave: 1,
          spawns: [
            { atMs: 0, pathId: 'PX', kind: 'poopGuardian', variant: 'male' },
          ],
        },
      ],
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('P1'),
      expect.stringContaining('PX'),
    ]));
  });

  it('Object prototype에서 상속되는 이름도 unknown path로 거부한다', () => {
    const firstWave = WAVE_DEFINITIONS[0];
    const waves = WAVE_DEFINITIONS.map((wave) => (
      wave.wave === 1
        ? {
            wave: firstWave.wave,
            spawns: [
              { ...firstWave.spawns[0]!, pathId: 'toString' },
              { ...firstWave.spawns[1]!, pathId: 'constructor' },
              ...firstWave.spawns.slice(2),
            ],
          }
        : wave
    ));

    const errors = validateGameData({ paths: PATH_DEFINITIONS, waves });

    expect(errors).toEqual(expect.arrayContaining([
      'wave 1[0]: unknown path toString',
      'wave 1[1]: unknown path constructor',
    ]));
  });

  it('공식 경로와 5개 웨이브를 오류 없이 승인한다', () => {
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: WAVE_DEFINITIONS })).toEqual([]);
  });

  it('필수 경로 누락과 2점 미만 경로를 보고한다', () => {
    const paths: Record<string, readonly (readonly [number, number])[]> = {
      ...PATH_DEFINITIONS,
      P1: [[110, 0]],
    };
    delete paths.P6;

    expect(validateGameData({ paths, waves: [] })).toEqual(expect.arrayContaining([
      expect.stringContaining('P1'),
      expect.stringContaining('at least two'),
      expect.stringContaining('P6'),
      expect.stringContaining('missing'),
    ]));
  });

  it('경로 key 집합은 P1부터 P6까지만 허용한다', () => {
    const errors = validateGameData({
      paths: { ...PATH_DEFINITIONS, P7: [[0, 0], [1, 1]] },
      waves: WAVE_DEFINITIONS,
    });

    expect(errors).toContain('path P7: unexpected');
  });

  it('웨이브는 1부터 5까지 순서대로 정확히 한 번씩 요구한다', () => {
    const emptyErrors = validateGameData({ paths: PATH_DEFINITIONS, waves: [] });
    const missingErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: WAVE_DEFINITIONS.slice(0, 4),
    });
    const duplicateErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [...WAVE_DEFINITIONS.slice(0, 4), WAVE_DEFINITIONS[3]],
    });
    const unknownErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [...WAVE_DEFINITIONS.slice(0, 4), { wave: 6, spawns: [] }],
    });
    const reorderedErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [
        WAVE_DEFINITIONS[1],
        WAVE_DEFINITIONS[0],
        ...WAVE_DEFINITIONS.slice(2),
      ],
    });

    expect(emptyErrors).toEqual(expect.arrayContaining([
      'waves: expected exactly 5, received 0',
      'wave 1: missing',
    ]));
    expect(missingErrors).toContain('wave 5: missing');
    expect(duplicateErrors).toContain('wave 4: duplicate');
    expect(unknownErrors).toEqual(expect.arrayContaining([
      'wave 5: missing',
      'wave 6: unexpected',
    ]));
    expect(reorderedErrors).toEqual(expect.arrayContaining([
      'waves[0]: expected wave 1, received 2',
      'waves[1]: expected wave 2, received 1',
    ]));
  });

  it('내림차순 시간과 같은 시각의 중복 경로를 보고한다', () => {
    const errors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [{
        wave: 1,
        spawns: [
          makeSpawn({ atMs: 100, pathId: 'P1' }),
          makeSpawn({ atMs: 0, pathId: 'P2' }),
          makeSpawn({ atMs: 0, pathId: 'P2', variant: 'female' }),
        ],
      }],
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('not ascending'),
      expect.stringContaining('duplicate path P2 at 0ms'),
    ]));
  });

  it('좌표는 finite이고 모든 인접 segment 길이는 finite 양수여야 한다', () => {
    const errors = validateGameData({
      paths: {
        ...PATH_DEFINITIONS,
        P1: [[Number.NaN, 0], [270, 430]],
        P2: [[430, 0], [430, 0], [270, 430]],
        P3: [[Number.POSITIVE_INFINITY, 0], [270, 430]],
      },
      waves: WAVE_DEFINITIONS,
    });

    expect(errors).toEqual(expect.arrayContaining([
      'path P1[0]: waypoint coordinates must be finite',
      'path P1 segment 0-1: length must be finite and greater than zero',
      'path P2 segment 0-1: length must be finite and greater than zero',
      'path P3[0]: waypoint coordinates must be finite',
      'path P3 segment 0-1: length must be finite and greater than zero',
    ]));
  });

  it('spawn atMs는 finite이고 0 이상이어야 한다', () => {
    const firstWave = WAVE_DEFINITIONS[0];
    const waves = WAVE_DEFINITIONS.map((wave) => (
      wave.wave === 1
        ? {
            wave: firstWave.wave,
            spawns: [
              { ...firstWave.spawns[0]!, atMs: Number.NaN },
              { ...firstWave.spawns[1]!, atMs: Number.POSITIVE_INFINITY },
              { ...firstWave.spawns[2]!, atMs: -1 },
              ...firstWave.spawns.slice(3),
            ],
          }
        : wave
    ));

    const errors = validateGameData({ paths: PATH_DEFINITIONS, waves });

    expect(errors).toEqual(expect.arrayContaining([
      'wave 1[0]: atMs must be finite and non-negative',
      'wave 1[1]: atMs must be finite and non-negative',
      'wave 1[2]: atMs must be finite and non-negative',
    ]));
  });

  it('웨이브 적 cap 60 초과를 보고한다', () => {
    const errors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [{
        wave: 1,
        spawns: Array.from({ length: 61 }, (_, index) => makeSpawn({ atMs: index })),
      }],
    });

    expect(errors).toContain('wave 1: 61 exceeds enemy cap 60');
  });

  it('보스는 P3와 지정 웨이브만 사용하게 한다', () => {
    const errors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [
        { wave: 1, spawns: [makeSpawn({ pathId: 'P3', kind: 'dogTrader' })] },
        { wave: 3, spawns: [makeSpawn({ pathId: 'P2', kind: 'dogTrader' })] },
      ],
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('invalid boss dogTrader'),
      expect.stringContaining('boss must use P3'),
    ]));
  });

  it('W3 trader와 W5 breeder가 정확히 하나인지 검사한다', () => {
    const errors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: [
        { wave: 3, spawns: [] },
        {
          wave: 5,
          spawns: [
            makeSpawn({ atMs: 0, pathId: 'P3', kind: 'illegalBreeder', variant: 'seeded' }),
            makeSpawn({ atMs: 1, pathId: 'P3', kind: 'illegalBreeder', variant: 'seeded' }),
          ],
        },
      ],
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('wave 3: expected exactly one dogTrader'),
      expect.stringContaining('wave 5: expected exactly one illegalBreeder'),
    ]));
  });

  it('일반 적 variant는 seeded를 금지하고 종류별 male/female 순서를 지킨다', () => {
    const seededErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: withSpawnVariant(1, 0, 'seeded'),
    });
    const parityErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: withSpawnVariant(1, 1, 'male'),
    });

    expect(seededErrors).toContain('wave 1[0]: poopGuardian cannot use seeded variant');
    expect(parityErrors).toContain('wave 1[1]: expected female variant for poopGuardian');
  });

  it('trader는 male, breeder는 seeded variant만 허용한다', () => {
    const traderErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: withSpawnVariant(3, 6, 'female'),
    });
    const breederErrors = validateGameData({
      paths: PATH_DEFINITIONS,
      waves: withSpawnVariant(5, 14, 'male'),
    });

    expect(traderErrors).toContain('wave 3[6]: dogTrader variant must be male');
    expect(breederErrors).toContain('wave 5[14]: illegalBreeder variant must be seeded');
  });
});

describe('BootScene', () => {
  it('잘못된 데이터의 첫 오류를 한국어로 표시하고 Preload를 시작하지 않는다', async () => {
    const originalP1 = PATH_DEFINITIONS.P1;
    Object.defineProperty(PATH_DEFINITIONS, 'P1', {
      value: [[-1, 0], [270, 430]],
      configurable: true,
      enumerable: true,
      writable: true,
    });

    try {
      const { BootScene } = await import('../../src/game/scenes/BootScene');
      const scene = new BootScene();
      const start = vi.fn();
      const element = {
        setDepth: vi.fn().mockReturnThis(),
        addListener: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        destroy: vi.fn(),
      };
      const createFromHTML = vi.fn(() => element);
      const dom = vi.fn(() => ({ createFromHTML }));
      Object.defineProperties(scene, {
        game: { value: { renderer: { type: 2 } } },
        scene: { value: { start } },
        add: { value: { dom } },
        events: { value: { once: vi.fn() } },
      });

      scene.create();

      expect(dom).toHaveBeenCalledWith(270, 480);
      expect(createFromHTML).toHaveBeenCalledWith(expect.stringContaining('게임 데이터를 확인하지 못했어요'));
      expect(createFromHTML).toHaveBeenCalledWith(expect.stringContaining('path P1'));
      expect(createFromHTML).toHaveBeenCalledWith(expect.stringContaining('다시 시도'));
      expect(start).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(PATH_DEFINITIONS, 'P1', {
        value: originalP1,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  });
});
