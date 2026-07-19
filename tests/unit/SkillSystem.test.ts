import {
  resolveBeamCommands,
  resolveHowlCommands,
  resolveSafetyCommand,
  resolveScoldCommands,
  resolveSkillStats,
  SkillSystem,
  type SkillCastCommand,
} from '../../src/game/skills/SkillSystem';
import type { SkillId, SkillLevel } from '../../src/game/types/GameTypes';
import {
  candidateAt,
  emptySkillContext,
  learnedSkillSystem,
  skillLevels,
} from './fixtures';

describe('SkillSystem', () => {
  it.each([
    ['scold', 2, { damage: 25, cooldownMs: 8000 }],
    ['aquaBeam', 2, { damage: 40, cooldownMs: 9000 }],
    ['deokbaeHowl', 2, { damage: 56, cooldownMs: 14000 }],
    ['safetyReport', 2, { damage: 113, cooldownMs: 20000 }],
    ['scold', 3, { damage: 25, cooldownMs: 6400, distance: 138, knockback: 34 }],
  ] as const)('%s level %i 계산', (id, level, expected) => {
    expect(resolveSkillStats(id, level)).toMatchObject(expected);
  });

  it('대상이 없으면 충전 뒤 ready 0을 유지하고 남은 step을 버리지 않는다', () => {
    const system = learnedSkillSystem('aquaBeam');

    expect(system.step(9000, emptySkillContext())).toEqual([]);
    expect(system.snapshot('aquaBeam')).toMatchObject({
      ready: true,
      cooldownRemainingMs: 0,
      progress: 1,
    });
    expect(system.step(90_000, emptySkillContext())).toEqual([]);
    expect(system.snapshot('aquaBeam')).toMatchObject({ ready: true, cooldownRemainingMs: 0 });
  });

  it('새 해금은 full cooldown 0%에서 시작하고 습득 순서와 level snapshot을 한 원본에서 낸다', () => {
    const system = new SkillSystem(skillLevels());

    expect(system.levelUp('aquaBeam')).toBe(1);
    expect(system.levelUp('scold')).toBe(1);

    expect(system.levelsSnapshot()).toEqual(skillLevels({ aquaBeam: 1, scold: 1 }));
    expect(system.learnedOrderSnapshot()).toEqual(['aquaBeam', 'scold']);
    expect(system.snapshot('aquaBeam')).toMatchObject({
      level: 1,
      cooldownRemainingMs: 9000,
      ready: false,
      progress: 0,
    });
  });

  it('level3 cooldown 감소 강화는 현재 충전 비율을 보존한다', () => {
    const system = learnedSkillSystem('scold');
    system.step(4000, emptySkillContext());

    system.levelUp('scold');
    system.levelUp('scold');

    expect(system.snapshot('scold')).toMatchObject({
      level: 3,
      cooldownRemainingMs: 3200,
      progress: 0.5,
    });
  });

  it('큰 step은 모든 cadence 경계를 처리하고 분할 step과 event/remaining이 exact 같다', () => {
    const context = {
      player: { x: 0, y: 0 },
      enemies: [candidateAt(100, 0, 10, { id: 3, spawnSequence: 4, pathProgress: 100 })],
    };
    const whole = learnedSkillSystem('scold');
    const split = learnedSkillSystem('scold');

    const wholeEvents = whole.step(20_000, context);
    const splitEvents = [
      ...split.step(7000, context),
      ...split.step(1000, context),
      ...split.step(2000, context),
      ...split.step(6000, context),
      ...split.step(4000, context),
    ];

    expect(wholeEvents).toEqual(splitEvents);
    expect(wholeEvents).toHaveLength(2);
    expect(whole.snapshot('scold')).toEqual(split.snapshot('scold'));
    expect(whole.snapshot('scold').cooldownRemainingMs).toBe(4000);
  });

  it('여러 learned skill의 큰 step event는 전역 시간순이며 같은 시각만 정의 순서다', () => {
    const context = {
      player: { x: 0, y: 0 },
      enemies: [candidateAt(100, 0, 10, { id: 3, pathProgress: 100 })],
    };
    const whole = new SkillSystem(skillLevels({ scold: 1, aquaBeam: 1 }));
    const split = new SkillSystem(skillLevels({ scold: 1, aquaBeam: 1 }));

    const wholeEvents = whole.step(18_000, context);
    const splitEvents = Array.from(
      { length: 18 },
      () => split.step(1000, context),
    ).flat();

    expect(wholeEvents.map(({ skillId }) => skillId)).toEqual([
      'scold',
      'aquaBeam',
      'scold',
      'aquaBeam',
    ]);
    expect(wholeEvents).toEqual(splitEvents);
    expect(whole.snapshot('scold')).toEqual(split.snapshot('scold'));
    expect(whole.snapshot('aquaBeam')).toEqual(split.snapshot('aquaBeam'));
  });

  it('ready-no-target 뒤 overshoot와 여러 cadence도 arbitrary split과 event/remaining이 같다', () => {
    const context = {
      player: { x: 0, y: 0 },
      enemies: [candidateAt(100, 0, 10, { id: 3, pathProgress: 100 })],
    };
    const whole = new SkillSystem(skillLevels({ scold: 1, aquaBeam: 1 }));
    const split = new SkillSystem(skillLevels({ scold: 1, aquaBeam: 1 }));
    whole.step(9500, emptySkillContext());
    split.step(9500, emptySkillContext());

    const wholeEvents = whole.step(27_500, context);
    const splitEvents = [0, 1250, 6750, 500, 8500, 10_500]
      .flatMap((stepMs) => split.step(stepMs, context));

    expect(wholeEvents.map(({ skillId }) => skillId)).toEqual([
      'scold',
      'aquaBeam',
      'scold',
      'aquaBeam',
      'scold',
      'aquaBeam',
      'scold',
      'aquaBeam',
    ]);
    expect(wholeEvents).toEqual(splitEvents);
    expect(whole.snapshot('scold')).toEqual(split.snapshot('scold'));
    expect(whole.snapshot('aquaBeam')).toEqual(split.snapshot('aquaBeam'));
  });

  it('ready에서 대상이 생기면 step 0에도 즉시 cast하고 full cooldown으로 돌아간다', () => {
    const system = learnedSkillSystem('aquaBeam');
    system.step(9000, emptySkillContext());

    const casts = system.step(0, {
      player: { x: 10, y: 10 },
      enemies: [candidateAt(10, 10, 1, { id: 9 })],
    });

    expect(casts.at(0)?.targetIds).toContain(9);
    expect(system.snapshot('aquaBeam')).toMatchObject({
      ready: false,
      cooldownRemainingMs: 9000,
    });
  });

  it('자동 방향은 스킬 사거리 안 위협만 고르고 동률이면 player 거리까지 공통 정렬한다', () => {
    const system = learnedSkillSystem('scold');
    const casts = system.step(8000, {
      player: { x: 0, y: 0 },
      enemies: [
        candidateAt(500, 0, 10, { id: 1, spawnSequence: 0 }),
        candidateAt(0, 100, 20, { id: 2, spawnSequence: 2 }),
        candidateAt(80, 0, 20, { id: 3, spawnSequence: 3 }),
      ],
    });

    expect(casts.at(0)?.targetIds).toEqual([3]);
    expect(system.snapshot('scold').ready).toBe(false);
  });

  it('player와 같은 좌표의 적도 zero-vector 예외 없이 직접 맞힌다', () => {
    const system = learnedSkillSystem('aquaBeam');

    expect(system.step(9000, {
      player: { x: 10, y: 10 },
      enemies: [candidateAt(10, 10, 1, { id: 9 })],
    }).at(0)?.targetIds).toContain(9);
  });

  it('reset은 초기 level/order/cooldown 상태를 같은 canonical system 안에서 복구한다', () => {
    const system = new SkillSystem(skillLevels({ scold: 1 }));
    system.step(4000, emptySkillContext());
    system.levelUp('aquaBeam');

    system.reset();

    expect(system.levelsSnapshot()).toEqual(skillLevels({ scold: 1 }));
    expect(system.learnedOrderSnapshot()).toEqual(['scold']);
    expect(system.snapshot('scold')).toMatchObject({ cooldownRemainingMs: 8000, progress: 0 });
    expect(system.snapshot('aquaBeam')).toMatchObject({ level: 0, ready: false });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'invalid step %s는 state 변경 전에 fail-fast한다',
    (stepMs) => {
      const system = learnedSkillSystem('scold');
      const before = system.snapshot('scold');

      expect(() => system.step(stepMs, emptySkillContext())).toThrow(RangeError);
      expect(system.snapshot('scold')).toEqual(before);
    },
  );
});

describe('skill geometry', () => {
  it('호통 level3은 exact 35도·138 경계를 포함하고 normal 34, boss 17 absolute progress를 낸다', () => {
    const radius = 138;
    const angle = 35 * Math.PI / 180;
    const hits = resolveScoldCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, [
      candidateAt(radius, 0, 100, { id: 8, spawnSequence: 8, pathProgress: 100 }),
      candidateAt(radius * Math.cos(angle), radius * Math.sin(angle), 100, {
        id: 2,
        spawnSequence: 2,
        pathProgress: 100,
        isBoss: true,
      }),
      candidateAt(radius * Math.cos(angle + 0.000_001), radius * Math.sin(angle + 0.000_001), 100, {
        id: 3,
        spawnSequence: 3,
        pathProgress: 100,
      }),
      candidateAt(radius + 0.000_001, 0, 100, { id: 4, spawnSequence: 4, pathProgress: 100 }),
      candidateAt(1, 0, 1, { id: 5, spawnSequence: 0, state: 'dead', currentHp: 0 }),
    ], 3);

    expect(hits).toEqual([
      { targetId: 2, damage: 25, nextPathProgress: 83 },
      { targetId: 8, damage: 25, nextPathProgress: 66 },
    ]);
  });

  it('resolver target order는 shuffled input과 같은 spawnSequence에서도 spawnSequence/id로 안정적이다', () => {
    const enemies = [
      candidateAt(10, 0, 1, { id: 9, spawnSequence: 3 }),
      candidateAt(20, 0, 1, { id: 2, spawnSequence: 1 }),
      candidateAt(30, 0, 1, { id: 1, spawnSequence: 1 }),
    ];

    expect(resolveScoldCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, enemies, 1)
      .map(({ targetId }) => targetId)).toEqual([1, 2, 9]);
    expect(resolveScoldCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, [...enemies].reverse(), 1)
      .map(({ targetId }) => targetId)).toEqual([1, 2, 9]);
  });

  it('아쿠아빔은 level1 길이250·폭22와 level3 길이300·폭26.4의 선분 경계를 포함한다', () => {
    const enemies = [
      candidateAt(200, 0, 100, { id: 1, spawnSequence: 1 }),
      candidateAt(250, 11, 100, { id: 2, spawnSequence: 2 }),
      candidateAt(200, 11.000_001, 100, { id: 3, spawnSequence: 3 }),
      candidateAt(250.000_001, 0, 100, { id: 4, spawnSequence: 4 }),
      candidateAt(300, 13.2, 100, { id: 5, spawnSequence: 5 }),
      candidateAt(-0.000_001, 0, 100, { id: 6, spawnSequence: 6 }),
    ];

    expect(resolveBeamCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, enemies, 1)
      .map(({ targetId }) => targetId)).toEqual([1, 2]);
    expect(resolveBeamCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, enemies, 3)
      .map(({ targetId }) => targetId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('하울링 반경은 level1 80, level3 96이고 exact 경계를 포함한다', () => {
    const enemies = [
      candidateAt(180, 100, 100, { id: 1, spawnSequence: 1 }),
      candidateAt(196, 100, 100, { id: 2, spawnSequence: 2 }),
      candidateAt(196.000_001, 100, 100, { id: 3, spawnSequence: 3 }),
    ];

    expect(resolveHowlCommands({ x: 100, y: 100 }, enemies, 1)
      .map(({ targetId }) => targetId)).toEqual([1]);
    expect(resolveHowlCommands({ x: 100, y: 100 }, enemies, 3)
      .map(({ targetId }) => targetId)).toEqual([1, 2]);
  });

  it('안전신문고는 최소 ETA 하나에 damage와 일반·boss stun을 정확히 적용한다', () => {
    expect(resolveSafetyCommand({ x: 0, y: 0 }, [
      candidateAt(0, 0, 100, { id: 1 }),
      candidateAt(0, 0, 200, { id: 2, isBoss: true }),
    ], 1)).toEqual({ targetId: 1, damage: 90, stunMs: 3000 });
    expect(resolveSafetyCommand({ x: 0, y: 0 }, [
      candidateAt(0, 0, 100, { id: 2, isBoss: true }),
    ], 3)).toEqual({ targetId: 2, damage: 113, stunMs: 1800 });
  });

  it('cast visual payload는 cast-time geometry와 target positions를 source mutation과 분리한다', () => {
    const target = candidateAt(100, 0, 1, { id: 7, pathProgress: 100 });
    const system = learnedSkillSystem('scold');

    const cast = system.step(8000, {
      player: { x: 0, y: 0 },
      enemies: [target],
    }).at(0) as SkillCastCommand;
    (target.position as { x: number }).x = 999;

    expect(cast.visual).toMatchObject({
      kind: 'scold',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      length: 115,
      angleDeg: 70,
      targetPositions: [{ targetId: 7, position: { x: 100, y: 0 } }],
    });
  });

  it.each([
    ['scold', 0],
    ['aquaBeam', 4],
  ] as const)('unlearned/invalid %s level %s stats를 거부한다', (id, level) => {
    expect(() => resolveSkillStats(id as Exclude<SkillId, 'bark'>, level as SkillLevel))
      .toThrow(RangeError);
  });
});
