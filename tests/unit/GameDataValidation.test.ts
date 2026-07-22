import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../src/game/data/balance';
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';
import { validateGameData } from '../../src/game/data/validateGameData';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import type { PathId } from '../../src/game/types/GameTypes';
import {
  NAV_CELL_SIZE,
  NAV_RECOMPUTE_INTERVAL_MS,
} from '../../src/game/world/NavigationField';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    WEBGL: 2,
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

afterEach(() => vi.unstubAllGlobals());

type TestGroup = [number, number, number, ('dogTrader' | 'illegalBreeder')?];
type TestWaveDefinition = {
  wave: number;
  pathIds: PathId[];
  groups: TestGroup[];
};

const cloneWaves = (): TestWaveDefinition[] => WAVE_DEFINITIONS.map((wave) => ({
  wave: wave.wave,
  pathIds: [...wave.pathIds],
  groups: wave.groups.map((group) => [...group] as TestGroup),
}));

describe('고정 게임 데이터', () => {
  it('동적 경로장은 30px 셀과 200ms 재계산 경계를 사용한다', () => {
    expect({ cellSize: NAV_CELL_SIZE, recomputeMs: NAV_RECOMPUTE_INTERVAL_MS })
      .toEqual({ cellSize: 30, recomputeMs: 200 });
  });

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

  it('V2 적 밸런스와 cap을 단일 데이터로 고정한다', () => {
    expect(BALANCE).toMatchObject({
      player: { speed: 150, opaqueHeightLogical: 72, maxHp: 1000, hitRadius: 24 },
      waveCountdownMs: 3000,
      enemies: {
        poopGuardian: { hp: 60, speed: 44, damage: 25, attackIntervalMs: 1800, snack: 2 },
        offLeashGuardian: { hp: 110, speed: 42, damage: 50, attackIntervalMs: 1800, snack: 4 },
        dogTrader: { hp: 900, speed: 35, damage: 120, attackIntervalMs: 2400, snack: 20 },
        illegalBreeder: { hp: 1500, speed: 64.4, damage: 160, attackIntervalMs: 2100, snack: 35 },
      },
      caps: { enemies: 60, projectiles: 80, particles: 120 },
    });
  });

  it('다섯 wave의 path set과 grouped schedule을 exact하게 고정한다', () => {
    expect(WAVE_DEFINITIONS).toEqual([
      { wave: 1, pathIds: ['P1', 'P2'], groups: [[0, 2, 0], [5, 2, 0], [10, 2, 0], [15, 2, 0], [20, 2, 0]] },
      { wave: 2, pathIds: ['P1', 'P2', 'P3', 'P4'], groups: [[0, 1, 1], [4.5, 1, 1], [9, 1, 1], [13.5, 1, 1], [18, 1, 1], [22.5, 1, 1], [28, 0, 2]] },
      { wave: 3, pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], groups: [[0, 1, 2], [6.5, 2, 1], [13, 1, 2], [19.5, 1, 2], [26, 2, 1], [32.5, 1, 2]] },
      { wave: 4, pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], groups: [[0, 2, 2], [10, 1, 2], [20, 1, 2], [34, 0, 0, 'dogTrader']] },
      { wave: 5, pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], groups: [[0, 2, 2], [10, 1, 2], [20, 1, 2], [40, 0, 0, 'illegalBreeder'], [55, 2, 2]] },
    ]);
  });
});

describe('validateGameData', () => {
  it('공식 경로와 exact 5개 wave를 오류 없이 승인한다', () => {
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: WAVE_DEFINITIONS })).toEqual([]);
  });

  it('맵 밖 좌표, 유한하지 않은 좌표, 0 길이 segment를 모두 보고한다', () => {
    const errors = validateGameData({
      paths: {
        ...PATH_DEFINITIONS,
        P1: [[-1, 0], [270, 430]],
        P2: [[430, 0], [430, 0]],
        P3: [[Number.NaN, 0], [270, 430]],
      },
      waves: WAVE_DEFINITIONS,
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('path P1[0]'),
      'path P2 segment 0-1: length must be finite and greater than zero',
      'path P3[0]: waypoint coordinates must be finite',
    ]));
  });

  it('필수 path 누락, 추가 path, 2점 미만 path를 보고한다', () => {
    const paths: Record<string, readonly (readonly [number, number])[]> = {
      ...PATH_DEFINITIONS,
      P1: [[110, 0]],
      P7: [[0, 0], [1, 1]],
    };
    delete paths.P6;

    expect(validateGameData({ paths, waves: WAVE_DEFINITIONS })).toEqual(expect.arrayContaining([
      'path P1: needs at least two waypoints',
      'path P6: missing',
      'path P7: unexpected',
    ]));
  });

  it('wave 1~5를 순서대로 정확히 한 번 요구한다', () => {
    const missing = cloneWaves().slice(0, 4);
    const duplicate = [...cloneWaves().slice(0, 4), cloneWaves()[3]!];
    const reordered = cloneWaves();
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];

    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: missing })).toEqual(
      expect.arrayContaining(['waves: expected exactly 5, received 4', 'wave 5: missing']),
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: duplicate })).toContain(
      'wave 4: duplicate',
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: reordered })).toEqual(
      expect.arrayContaining([
        'waves[0]: expected wave 1, received 2',
        'waves[1]: expected wave 2, received 1',
      ]),
    );
  });

  it('wave별 exact path set의 누락, 중복, 순서, unknown path를 거부한다', () => {
    const missing = cloneWaves();
    missing[1] = { ...missing[1]!, pathIds: ['P1', 'P2', 'P3'] };
    const duplicate = cloneWaves();
    duplicate[0] = { ...duplicate[0]!, pathIds: ['P1', 'P1'] };
    const reordered = cloneWaves();
    reordered[0] = { ...reordered[0]!, pathIds: ['P2', 'P1'] };
    const unknown = cloneWaves();
    unknown[0] = {
      ...unknown[0]!,
      pathIds: ['P1', 'PX' as never],
    };

    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: missing })).toContain(
      'wave 2: expected path set P1,P2,P3,P4',
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: duplicate })).toEqual(
      expect.arrayContaining([
        'wave 1: duplicate path P1',
        'wave 1: expected path set P1,P2',
      ]),
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: reordered })).toContain(
      'wave 1: expected path set P1,P2',
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: unknown })).toContain(
      'wave 1: unknown path PX',
    );
  });

  it('group tuple shape와 finite ascending seconds를 검사한다', () => {
    const malformed = cloneWaves();
    malformed[0] = {
      ...malformed[0]!,
      groups: [
        [0, 2] as never,
        [Number.NaN, 2, 0],
        [14, 2, 0],
        [13, 2, 0],
        [28, 2, 0, undefined, 'extra'] as never,
      ],
    };

    const errors = validateGameData({ paths: PATH_DEFINITIONS, waves: malformed });
    expect(errors).toEqual(expect.arrayContaining([
      'wave 1 group 0: expected tuple length 3 or 4',
      'wave 1 group 1: seconds must be finite and non-negative',
      'wave 1 group 3: seconds must be ascending',
      'wave 1 group 4: expected tuple length 3 or 4',
    ]));
  });

  it('group count는 non-negative safe integer이고 event path 수를 넘지 않는다', () => {
    const malformed = cloneWaves();
    malformed[0] = {
      ...malformed[0]!,
      groups: [
        [0, -1, 0],
        [7, 1.5, 0],
        [14, Number.MAX_SAFE_INTEGER + 1, 0],
        [21, 3, 0],
        [28, 0, 0],
      ],
    };

    const errors = validateGameData({ paths: PATH_DEFINITIONS, waves: malformed });
    expect(errors).toEqual(expect.arrayContaining([
      'wave 1 group 0: poopGuardian count must be a non-negative safe integer',
      'wave 1 group 1: poopGuardian count must be a non-negative safe integer',
      'wave 1 group 2: poopGuardian count must be a non-negative safe integer',
      'wave 1 group 3: event count 3 exceeds unique path count 2',
      'wave 1 group 4: event must spawn at least one enemy',
    ]));
  });

  it('exact 시간과 family count가 바뀐 정의를 거부한다', () => {
    const changedTime = cloneWaves();
    changedTime[2]!.groups[1] = [7, 2, 1];
    const changedCount = cloneWaves();
    changedCount[4]!.groups[4] = [55, 1, 3];

    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: changedTime })).toContain(
      'wave 3 group 1: expected 6.5,2,1',
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: changedCount })).toContain(
      'wave 5 group 4: expected 55,2,2',
    );
  });

  it('dogTrader는 W4 t=34, illegalBreeder는 W5 t=40에만 하나씩 허용한다', () => {
    const wrongBoss = cloneWaves();
    wrongBoss[3]!.groups[3] = [34, 0, 0, 'illegalBreeder'];
    const earlyBoss = cloneWaves();
    earlyBoss[0]!.groups[0] = [0, 1, 0, 'dogTrader'];
    const duplicateBoss = cloneWaves();
    duplicateBoss[4]!.groups[4] = [55, 1, 2, 'illegalBreeder'];

    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: wrongBoss })).toEqual(
      expect.arrayContaining([
        'wave 4 group 3: invalid boss illegalBreeder',
        'wave 4: expected exactly one dogTrader',
      ]),
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: earlyBoss })).toContain(
      'wave 1 group 0: invalid boss dogTrader',
    );
    expect(validateGameData({ paths: PATH_DEFINITIONS, waves: duplicateBoss })).toContain(
      'wave 5: expected exactly one illegalBreeder',
    );
  });
});

describe('BootScene', () => {
  it('window.localStorage getter SecurityError에도 audio를 설치하고 Preload를 시작한다', async () => {
    const deniedWindow = {};
    Object.defineProperty(deniedWindow, 'localStorage', {
      get: () => { throw new DOMException('denied', 'SecurityError'); },
    });
    vi.stubGlobal('window', deniedWindow);
    const { BootScene } = await import('../../src/game/scenes/BootScene');
    const scene = new BootScene();
    const values = new Map<string, unknown>();
    const start = vi.fn();
    Object.defineProperties(scene, {
      game: { value: { renderer: { type: 2 } } },
      registry: {
        value: {
          get: vi.fn((key: string) => values.get(key)),
          set: vi.fn((key: string, value: unknown) => values.set(key, value)),
        },
      },
      scene: { value: { start } },
      events: { value: { once: vi.fn() } },
    });

    expect(() => scene.create()).not.toThrow();
    expect(start).toHaveBeenCalledWith('Preload');
    expect(values.has('huchu-defense:audio')).toBe(true);
  });

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
        node: { querySelector: vi.fn(() => new EventTarget()) },
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
