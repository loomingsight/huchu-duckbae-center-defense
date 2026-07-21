import type { DamageCommand } from '../../src/game/combat/CombatTypes';
import { TIME_EPSILON_MS } from '../../src/game/constants';
import type { SkillImpactEvent } from '../../src/game/skills/SkillTypes';
import {
  damageCommandsForSkillImpact,
  SkillSystem,
  tailEffectFor,
} from '../../src/game/skills/SkillSystem';
import {
  impactStrengthFor,
  SKILL_DEFINITIONS,
} from '../../src/game/skills/skillDefinitions';
import type { DamageSource } from '../../src/game/types/GameTypes';
import { enemy, learnedSkillSystem } from './fixtures';

describe('SkillSystem timeline', () => {
  it('고정 cooldown과 impact 시각 및 source별 피드백 강도를 제공한다', () => {
    expect(SKILL_DEFINITIONS).toEqual({
      tailSwipe: { cooldownMs: 8000, impactMs: 250, damage: 14 },
      aquaBeam: { cooldownMs: 10_000, impactMs: 600, damage: 160 },
      safetyReport: {
        cooldownMs: 22_000,
        impactMs: 300,
        regularDamage: 90,
        bossDamage: 45,
      },
    });
    expect(([
      'bark',
      'deokbae',
      'tailSwipe',
      'aquaBeam',
      'safetyReport',
    ] as DamageSource[]).map(impactStrengthFor)).toEqual([
      'light', 'light', 'medium', 'heavy', 'heavy',
    ]);
  });

  it('같은 step에 밀린 ready는 readyAt 순서, 동률은 priority대로 200ms 간격으로 시작한다', () => {
    const system = new SkillSystem();
    for (const id of ['safetyReport', 'aquaBeam', 'tailSwipe'] as const) {
      system.learn(id, 0);
    }
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, currentHp: 200, position: { x: 10, y: 0 } })],
    };

    expect(startedIds(system.step(22_000, context))).toEqual(['tailSwipe']);
    expect(startedIds(system.step(22_199.999, context))).toEqual([]);
    expect(startedIds(system.step(22_200, context))).toEqual(['aquaBeam']);
    expect(startedIds(system.step(22_400, context))).toEqual(['safetyReport']);

    const tied = new SkillSystem();
    tied.learn('tailSwipe', 14_000);
    tied.learn('aquaBeam', 12_000);
    tied.learn('safetyReport', 0);
    expect(startedIds(tied.step(22_000, context))).toEqual(['tailSwipe']);
    expect(startedIds(tied.step(22_200, context))).toEqual(['aquaBeam']);
    expect(startedIds(tied.step(22_400, context))).toEqual(['safetyReport']);
  });

  it('readyAt이 다르면 priority보다 먼저 ready였던 스킬을 선택한다', () => {
    const system = new SkillSystem();
    system.learn('safetyReport', 0);
    system.learn('tailSwipe', 20_000);
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 0 } })],
    };

    expect(startedIds(system.step(30_000, context))).toEqual(['safetyReport']);
    expect(startedIds(system.step(30_200, context))).toEqual(['tailSwipe']);
  });

  it('대상이 없는 ready는 보존하고 성공한 cast만 global queue를 잠근다', () => {
    const system = new SkillSystem();
    system.learn('tailSwipe', 0);
    system.learn('aquaBeam', 0);

    expect(system.step(10_000, { player: { x: 0, y: 0 }, enemies: [] })).toEqual([]);
    expect(system.snapshot('tailSwipe')).toMatchObject({ ready: true, cooldownRemainingMs: 0 });
    expect(system.snapshot('aquaBeam')).toMatchObject({ ready: true, cooldownRemainingMs: 0 });

    const farTarget = enemy({ id: 9, position: { x: 1000, y: 0 } });
    expect(startedIds(system.step(10_000, {
      player: { x: 0, y: 0 },
      enemies: [farTarget],
    }))).toEqual(['aquaBeam']);
    expect(system.snapshot('tailSwipe')).toMatchObject({ ready: true, cooldownRemainingMs: 0 });
    expect(startedIds(system.step(10_199, {
      player: { x: 1000, y: 0 },
      enemies: [farTarget],
    }))).toEqual([]);
    expect(startedIds(system.step(10_200, {
      player: { x: 1000, y: 0 },
      enemies: [farTarget],
    }))).toEqual(['tailSwipe']);
  });

  it('문맥 검증만 필요한 step은 표적 순위 비교를 수행하지 않는다', () => {
    let hpReads = 0;
    const enemies = [enemy({ id: 1 }), enemy({ id: 2 })].map((candidate) => {
      Object.defineProperty(candidate, 'currentHp', {
        configurable: true,
        enumerable: true,
        get: () => {
          hpReads += 1;
          return 100;
        },
      });
      return candidate;
    });

    new SkillSystem().step(0, { player: { x: 0, y: 0 }, enemies });

    expect(hpReads).toBe(2);
  });

  it('cooldown은 성공한 cast 시작 시점부터 다시 계산하고 active cast를 snapshot한다', () => {
    const system = learnedSkillSystem('tailSwipe');
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 0 } })],
    };

    system.step(8000, context);

    expect(system.snapshot('tailSwipe')).toEqual({
      learned: true,
      cooldownRemainingMs: 8000,
      ready: false,
      progress: 0,
      activeCastId: 'tailSwipe:1',
    });
    system.step(8250, context);
    expect(system.snapshot('tailSwipe')).toMatchObject({
      cooldownRemainingMs: 7750,
      activeCastId: null,
    });
  });

  it('aqua는 현재 HP, boss, 위협도, 거리, 생성 순서 순으로 최초 표적을 고른다', () => {
    const system = learnedSkillSystem('aquaBeam');
    const events = system.step(10_000, {
      player: { x: 0, y: 0 },
      enemies: [
        enemy({ id: 9, currentHp: 199, isBoss: true, etaMs: 1, position: { x: 1, y: 0 } }),
        enemy({ id: 8, currentHp: 200, isBoss: false, etaMs: 1, position: { x: 1, y: 0 } }),
        enemy({ id: 7, currentHp: 200, isBoss: true, etaMs: 20, position: { x: 1, y: 0 } }),
        enemy({ id: 6, currentHp: 200, isBoss: true, etaMs: 10, position: { x: 10, y: 0 } }),
        enemy({ id: 5, currentHp: 200, isBoss: true, etaMs: 10, position: { x: 5, y: 0 }, spawnSequence: 2 }),
        enemy({ id: 4, currentHp: 200, isBoss: true, etaMs: 10, position: { x: 5, y: 0 }, spawnSequence: 1 }),
      ],
    });

    expect(events.at(0)).toMatchObject({
      type: 'skillCastStarted',
      castId: 'aquaBeam:1',
      skillId: 'aquaBeam',
      targets: [{ targetId: 4, position: { x: 5, y: 0 } }],
      durationMs: 600,
    });
  });

  it('aqua 문맥 검증과 표적 선택은 scheduler 외 전체 정렬을 추가하지 않는다', () => {
    const system = learnedSkillSystem('aquaBeam');
    const sort = vi.spyOn(Array.prototype, 'sort');
    let events: ReturnType<SkillSystem['step']>;
    let sortCalls: number;

    try {
      events = system.step(10_000, {
        player: { x: 0, y: 0 },
        enemies: [
          enemy({ id: 2, currentHp: 100, position: { x: 1, y: 0 } }),
          enemy({ id: 1, currentHp: 200, position: { x: 2, y: 0 } }),
        ],
      });
      sortCalls = sort.mock.calls.length;
    } finally {
      sort.mockRestore();
    }

    expect(events.at(0)).toMatchObject({
      type: 'skillCastStarted',
      targets: [{ targetId: 1 }],
    });
    expect(sortCalls).toBe(2);
  });

  it('aqua는 600ms 동안 한 번만 retarget하고 남은 charge를 보존한다', () => {
    const system = learnedSkillSystem('aquaBeam');
    system.step(10_000, {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, currentHp: 200 })],
    });

    expect(system.step(10_300, {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 2, currentHp: 100 })],
    })).toContainEqual(expect.objectContaining({
      type: 'skillTargetChanged',
      castId: 'aquaBeam:1',
      previousTargetId: 1,
      targetId: 2,
    }));
    expect(system.step(10_599, {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 2, currentHp: 100 })],
    }).some(({ type }) => type === 'skillImpact')).toBe(false);
    expect(system.step(10_600, {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 3, currentHp: 300 })],
    }).find(({ type }) => type === 'skillImpact')).toMatchObject({
      castId: 'aquaBeam:1',
      targets: [],
    });
  });

  it('tail은 2.2H 경계를 포함해 impact에서 재평가하고 normal/boss 효과를 고정한다', () => {
    const system = learnedSkillSystem('tailSwipe');
    const atStart = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 9, position: { x: 1, y: 0 } })],
    };
    system.step(8000, atStart);

    const impact = system.step(8250, {
      player: { x: 0, y: 0 },
      enemies: [
        enemy({ id: 1, position: { x: 158.4, y: 0 }, isBoss: false, spawnSequence: 1 }),
        enemy({ id: 2, position: { x: 0, y: 158.4 }, isBoss: true, spawnSequence: 2 }),
        enemy({ id: 3, position: { x: 158.400_001, y: 0 }, spawnSequence: 3 }),
      ],
    }).find(({ type }) => type === 'skillImpact');

    expect(impact).toMatchObject({
      type: 'skillImpact',
      castId: 'tailSwipe:1',
      targets: [{ targetId: 1 }, { targetId: 2 }],
    });
    expect(tailEffectFor(false)).toEqual({ knockbackPx: 35, multiplier: 0.6, durationMs: 1500 });
    expect(tailEffectFor(true)).toEqual({ knockbackPx: 35, multiplier: 0.8, durationMs: 1000 });
  });

  it('safety는 300ms 뒤 start snapshot 중 생존한 모든 적만 동시에 impact한다', () => {
    const system = learnedSkillSystem('safetyReport');
    const initial = [
      enemy({ id: 1, isBoss: false, spawnSequence: 1, position: { x: 10, y: 0 } }),
      enemy({ id: 2, isBoss: true, spawnSequence: 2, position: { x: 0, y: 10 } }),
      enemy({ id: 3, isBoss: false, spawnSequence: 3, position: { x: -10, y: 0 } }),
    ];
    system.step(22_000, { player: { x: 0, y: 0 }, enemies: initial });

    const events = system.step(22_300, {
      player: { x: 50, y: 50 },
      enemies: [
        enemy({ ...initial[0], position: { x: 20, y: 0 } }),
        enemy({ ...initial[1], position: { x: 0, y: 20 } }),
        enemy({ id: 4, isBoss: false, spawnSequence: 4, position: { x: 50, y: 0 } }),
      ],
    });
    const impact = events.find(({ type }) => type === 'skillImpact') as SkillImpactEvent;
    const commands = damageCommandsForSkillImpact(impact, [
      enemy({ id: 1, isBoss: false, position: { x: 20, y: 0 } }),
      enemy({ id: 2, isBoss: true, position: { x: 0, y: 20 } }),
    ]);

    expect(impact).toMatchObject({
      type: 'skillImpact',
      castId: 'safetyReport:1',
      origin: { x: 0, y: 0 },
      targets: [{ targetId: 1 }, { targetId: 2 }],
    });
    expect(commands).toEqual([
      expect.objectContaining({
        castId: 'safetyReport:1', targetId: 1, amount: 90,
        source: 'safetyReport', strength: 'heavy', impactDirection: { x: 1, y: 0 },
      }),
      expect.objectContaining({
        castId: 'safetyReport:1', targetId: 2, amount: 45,
        source: 'safetyReport', strength: 'heavy', impactDirection: { x: 0, y: 1 },
      }),
    ]);
    expect(new Set(commands.map(({ castId }) => castId))).toEqual(new Set(['safetyReport:1']));
  });

  it('모든 skill command는 정규화 방향을 쓰고 zero vector는 위쪽으로 고정한다', () => {
    const impact: SkillImpactEvent = {
      type: 'skillImpact',
      castId: 'tailSwipe:7',
      skillId: 'tailSwipe',
      origin: { x: 10, y: 20 },
      targets: [
        { targetId: 1, position: { x: 13, y: 24 } },
        { targetId: 2, position: { x: 10, y: 20 } },
      ],
    };

    expect(damageCommandsForSkillImpact(impact, [
      enemy({ id: 1, position: { x: 13, y: 24 } }),
      enemy({ id: 2, position: { x: 10, y: 20 } }),
    ])).toEqual([
      {
        castId: 'tailSwipe:7', targetId: 1, amount: 14,
        impactDirection: { x: 0.6, y: 0.8 }, source: 'tailSwipe', strength: 'medium',
      },
      {
        castId: 'tailSwipe:7', targetId: 2, amount: 14,
        impactDirection: { x: 0, y: -1 }, source: 'tailSwipe', strength: 'medium',
      },
    ] satisfies DamageCommand[]);
  });

  it('동일 timestamp 재호출은 event를 중복 emit하지 않고 reset은 cast sequence까지 복구한다', () => {
    const system = learnedSkillSystem('tailSwipe');
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 0 } })],
    };

    expect(system.step(8000, context).at(0)).toMatchObject({ castId: 'tailSwipe:1' });
    expect(system.step(8000, context)).toEqual([]);
    expect(system.step(8250, context).filter(({ type }) => type === 'skillImpact')).toHaveLength(1);
    expect(system.step(8250, context)).toEqual([]);

    system.reset();
    expect(system.snapshot('tailSwipe')).toEqual({
      learned: false,
      cooldownRemainingMs: 0,
      ready: false,
      progress: 0,
      activeCastId: null,
    });
    system.learn('tailSwipe', 9000);
    expect(system.step(17_000, context).at(0)).toMatchObject({ castId: 'tailSwipe:1' });
  });

  it('서로 다른 deadline의 동시 pending cast를 큰 time leap에서도 impactAtMs 순으로 처리한다', () => {
    const system = new SkillSystem();
    system.learn('safetyReport', 0);
    system.learn('aquaBeam', 12_200);
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, currentHp: 200, position: { x: 10, y: 0 } })],
    };

    expect(startedIds(system.step(22_000, context))).toEqual(['safetyReport']);
    expect(startedIds(system.step(22_200, context))).toEqual(['aquaBeam']);
    expect(system.snapshot('safetyReport').activeCastId).toBe('safetyReport:1');
    expect(system.snapshot('aquaBeam').activeCastId).toBe('aquaBeam:1');

    expect(system.step(23_000, context)
      .filter((event) => event.type === 'skillImpact')
      .map(({ castId, skillId }) => ({ castId, skillId }))).toEqual([
      { castId: 'safetyReport:1', skillId: 'safetyReport' },
      { castId: 'aquaBeam:1', skillId: 'aquaBeam' },
    ]);
  });

  it('TIME_EPSILON_MS/2만큼 감소한 timestamp도 state 변경 전에 거부한다', () => {
    const system = learnedSkillSystem('aquaBeam');
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 0 } })],
    };
    system.step(10_000, context);
    const before = system.snapshot('aquaBeam');

    expect(() => system.step(10_000 - TIME_EPSILON_MS / 2, context)).toThrow(RangeError);
    expect(system.snapshot('aquaBeam')).toEqual(before);
  });

  it('큰 timestamp를 결정적으로 처리하고 감소 timestamp와 invalid 입력은 state 변경 전에 거부한다', () => {
    const system = learnedSkillSystem('aquaBeam', 1_000_000_000_000);
    const context = {
      player: { x: 0, y: 0 },
      enemies: [enemy({ id: 1, position: { x: 10, y: 0 } })],
    };

    expect(system.step(1_000_000_010_000, context).at(0)).toMatchObject({
      type: 'skillCastStarted', castId: 'aquaBeam:1',
    });
    const before = system.snapshot('aquaBeam');
    expect(() => system.step(1_000_000_009_999, context)).toThrow(RangeError);
    expect(system.snapshot('aquaBeam')).toEqual(before);
    expect(() => system.step(Number.POSITIVE_INFINITY, context)).toThrow(RangeError);
    expect(system.snapshot('aquaBeam')).toEqual(before);
    expect(() => system.step(Number.MAX_VALUE, context)).toThrow(RangeError);
    expect(system.snapshot('aquaBeam')).toEqual(before);
  });
});

function startedIds(events: ReturnType<SkillSystem['step']>): string[] {
  return events
    .filter(({ type }) => type === 'skillCastStarted')
    .map(({ skillId }) => skillId);
}
