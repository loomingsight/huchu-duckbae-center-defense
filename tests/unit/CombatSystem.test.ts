import { CombatSystem } from '../../src/game/combat/CombatSystem';
import type {
  DamageCommand,
  EnemyDamageResult,
} from '../../src/game/combat/CombatTypes';

describe('CombatSystem', () => {
  it('requested/effective/lethal을 appliedAtStep에 기록하고 lifecycle보다 먼저 emit한다', () => {
    const target = {
      damage: (): EnemyDamageResult => ({
        effectiveAmount: 10,
        position: { x: 3, y: 4 },
        lethal: true,
        lifecycleEvents: [
          { type: 'enemyDied', enemyId: 1 },
          { type: 'snackEarned', enemyId: 1, amount: 2 },
        ],
      }),
    };
    const events = new CombatSystem(target).applyDamage([command()], 42);

    expect(events).toEqual([
      {
        type: 'damageApplied',
        castId: 'bark:1',
        appliedAtStep: 42,
        targetId: 1,
        amount: 18,
        effectiveAmount: 10,
        position: { x: 3, y: 4 },
        impactDirection: { x: 1, y: 0 },
        source: 'bark',
        strength: 'light',
        lethal: true,
      },
      { type: 'enemyDied', enemyId: 1 },
      { type: 'snackEarned', enemyId: 1, amount: 2 },
    ]);
  });

  it('target 결과의 effectiveAmount를 requested damage 범위로 clamp한다', () => {
    const results = [-3, 999];
    const combat = new CombatSystem({
      damage: (): EnemyDamageResult => ({
        effectiveAmount: results.shift()!,
        position: { x: 0, y: 0 },
        lethal: false,
        lifecycleEvents: [],
      }),
    });

    expect(combat.applyDamage([
      command({ castId: 'bark:1' }),
      command({ castId: 'bark:2' }),
    ], 1).filter((event) => event.type === 'damageApplied').map(({ effectiveAmount }) => effectiveAmount))
      .toEqual([0, 18]);
  });

  it('한 batch에서 같은 castId-target만 dedupe하고 다른 target/cast는 모두 적용한다', () => {
    const applied: Array<{ readonly targetId: number; readonly amount: number }> = [];
    const combat = new CombatSystem({
      damage: (targetId, amount): EnemyDamageResult => {
        applied.push({ targetId, amount });
        return {
          effectiveAmount: amount,
          position: { x: targetId, y: 0 },
          lethal: false,
          lifecycleEvents: [],
        };
      },
    });

    const events = combat.applyDamage([
      command({ castId: 'safetyReport:1', targetId: 7, amount: 90, source: 'safetyReport', strength: 'heavy' }),
      command({ castId: 'safetyReport:1', targetId: 7, amount: 999, source: 'safetyReport', strength: 'heavy' }),
      command({ castId: 'safetyReport:1', targetId: 8, amount: 45, source: 'safetyReport', strength: 'heavy' }),
      command({ castId: 'safetyReport:2', targetId: 7, amount: 90, source: 'safetyReport', strength: 'heavy' }),
      command({ castId: 'ignored-zero', targetId: 7, amount: 0 }),
      command({ castId: 'ignored-negative', targetId: 7, amount: -1 }),
    ], 9);

    expect(applied).toEqual([
      { targetId: 7, amount: 90 },
      { targetId: 8, amount: 45 },
      { targetId: 7, amount: 90 },
    ]);
    expect(events.filter(({ type }) => type === 'damageApplied')).toHaveLength(3);
    expect(new Set(events
      .filter((event) => event.type === 'damageApplied')
      .map(({ appliedAtStep }) => appliedAtStep))).toEqual(new Set([9]));
  });

  it('dedupe 상태는 apply batch 사이에 남지 않는다', () => {
    const damage = vi.fn((): EnemyDamageResult => ({
      effectiveAmount: 18,
      position: { x: 0, y: 0 },
      lethal: false,
      lifecycleEvents: [],
    }));
    const combat = new CombatSystem({ damage });

    combat.applyDamage([command()], 1);
    combat.applyDamage([command()], 2);

    expect(damage).toHaveBeenCalledTimes(2);
  });

  it('빈 batch와 0 이하 amount는 target을 호출하거나 event를 만들지 않는다', () => {
    const damage = vi.fn((): EnemyDamageResult => ({
      effectiveAmount: 0,
      position: { x: 0, y: 0 },
      lethal: false,
      lifecycleEvents: [],
    }));
    const combat = new CombatSystem({ damage });

    expect(combat.applyDamage([], 0)).toEqual([]);
    expect(combat.applyDamage([
      command({ castId: 'zero', amount: 0 }),
      command({ castId: 'negative', amount: -10 }),
    ], 0)).toEqual([]);
    expect(damage).not.toHaveBeenCalled();
  });

  it.each([
    command({ castId: '' }),
    command({ castId: '   ' }),
    command({ castId: 1 as never }),
    command({ targetId: -1 }),
    command({ targetId: 1.5 }),
    command({ targetId: Number.MAX_SAFE_INTEGER + 1 }),
    command({ amount: Number.NaN }),
    command({ amount: Number.POSITIVE_INFINITY }),
    command({ impactDirection: { x: 0, y: 0 } }),
    command({ impactDirection: { x: 2, y: 0 } }),
    command({ source: 'unknown' as never }),
    command({ strength: 'heavy' }),
  ])('invalid command를 batch 적용 전에 fail-fast한다', (invalid) => {
    const damage = vi.fn((): EnemyDamageResult => ({
      effectiveAmount: 0,
      position: { x: 0, y: 0 },
      lethal: false,
      lifecycleEvents: [],
    }));
    const combat = new CombatSystem({ damage });

    expect(() => combat.applyDamage([command(), invalid], 1)).toThrow(RangeError);
    expect(damage).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'invalid appliedAtStep %s를 batch 적용 전에 거부한다',
    (appliedAtStep) => {
      const damage = vi.fn((): EnemyDamageResult => ({
        effectiveAmount: 0,
        position: { x: 0, y: 0 },
        lethal: false,
        lifecycleEvents: [],
      }));
      const combat = new CombatSystem({ damage });

      expect(() => combat.applyDamage([command()], appliedAtStep)).toThrow(RangeError);
      expect(damage).not.toHaveBeenCalled();
    },
  );

  it('입력 command와 target 결과 point를 변경하지 않고 event에는 복사한다', () => {
    const input = Object.freeze(command());
    const commands = Object.freeze([input]);
    const position = { x: 3, y: 4 };
    const combat = new CombatSystem({
      damage: (): EnemyDamageResult => ({
        effectiveAmount: 10,
        position,
        lethal: false,
        lifecycleEvents: [],
      }),
    });

    const events = combat.applyDamage(commands, 1);
    position.x = 999;

    expect(events.at(0)).toMatchObject({ position: { x: 3, y: 4 } });
    expect(commands).toEqual([input]);
  });
});

function command(overrides: Partial<DamageCommand> = {}): DamageCommand {
  return {
    castId: 'bark:1',
    targetId: 1,
    amount: 18,
    impactDirection: { x: 1, y: 0 },
    source: 'bark',
    strength: 'light',
    ...overrides,
  };
}
