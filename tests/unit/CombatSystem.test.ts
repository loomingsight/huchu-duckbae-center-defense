import { CombatSystem } from '../../src/game/combat/CombatSystem';
import type { DamageCommand } from '../../src/game/combat/CombatTypes';
import { FIXED_STEP_MS } from '../../src/game/constants';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { GameSession } from '../../src/game/session/GameSession';

describe('CombatSystem', () => {
  it('한 cast의 서로 다른 target은 모두 적용하고 같은 attack-target 쌍만 한 batch에서 한 번 처리한다', () => {
    const applied: Array<{ readonly targetId: number; readonly amount: number }> = [];
    const combat = new CombatSystem({
      damage: (targetId, amount) => {
        applied.push({ targetId, amount });
        return [
          { type: 'enemyDied', enemyId: targetId },
          { type: 'snackEarned', enemyId: targetId, amount: 2 },
        ];
      },
    });
    const commands = [
      { attackId: 'bark:1', targetId: 7, amount: 10 },
      { attackId: 'bark:1', targetId: 7, amount: 999 },
      { attackId: 'bark:1', targetId: 8, amount: 10 },
      { attackId: 'bark:2', targetId: 7, amount: 10 },
      { attackId: 'ignored-zero', targetId: 7, amount: 0 },
      { attackId: 'ignored-negative', targetId: 7, amount: -1 },
    ] as const;

    expect(combat.applyDamage(commands)).toEqual([
      { type: 'enemyDied', enemyId: 7 },
      { type: 'snackEarned', enemyId: 7, amount: 2 },
      { type: 'enemyDied', enemyId: 8 },
      { type: 'snackEarned', enemyId: 8, amount: 2 },
      { type: 'enemyDied', enemyId: 7 },
      { type: 'snackEarned', enemyId: 7, amount: 2 },
    ]);
    expect(applied).toEqual([
      { targetId: 7, amount: 10 },
      { targetId: 8, amount: 10 },
      { targetId: 7, amount: 10 },
    ]);
  });

  it('dedupe 상태는 apply batch 사이에 남지 않는다', () => {
    const applied: number[] = [];
    const combat = new CombatSystem({
      damage: (_targetId, amount) => {
        applied.push(amount);
        return [];
      },
    });
    const command = { attackId: 'bark:1', targetId: 7, amount: 10 } as const;

    combat.applyDamage([command]);
    combat.applyDamage([command]);

    expect(applied).toEqual([10, 10]);
  });

  it('colon을 포함한 attackId도 target pair 충돌 없이 구분한다', () => {
    const applied: number[] = [];
    const combat = new CombatSystem({
      damage: (targetId) => {
        applied.push(targetId);
        return [];
      },
    });

    combat.applyDamage([
      { attackId: 'bark:1', targetId: 2, amount: 10 },
      { attackId: 'bark', targetId: 1, amount: 10 },
    ]);

    expect(applied).toEqual([2, 1]);
  });

  it('빈 batch와 0 이하 amount는 target을 호출하지 않는다', () => {
    const damage = vi.fn(() => []);
    const combat = new CombatSystem({ damage });

    expect(combat.applyDamage([])).toEqual([]);
    expect(combat.applyDamage([
      { attackId: 'zero', targetId: 0, amount: 0 },
      { attackId: 'negative', targetId: 0, amount: -10 },
    ])).toEqual([]);
    expect(damage).not.toHaveBeenCalled();
  });

  it.each([
    { attackId: '', targetId: 0, amount: 1 },
    { attackId: '   ', targetId: 0, amount: 1 },
    { attackId: 1 as never, targetId: 0, amount: 1 },
    { attackId: 'unsafe-target', targetId: -1, amount: 1 },
    { attackId: 'unsafe-target', targetId: 1.5, amount: 1 },
    { attackId: 'unsafe-target', targetId: Number.MAX_SAFE_INTEGER + 1, amount: 1 },
    { attackId: 'unsafe-amount', targetId: 0, amount: Number.NaN },
    { attackId: 'unsafe-amount', targetId: 0, amount: Number.POSITIVE_INFINITY },
  ])('invalid command $attackId/$targetId/$amount를 fail-fast한다', (invalid) => {
    const combat = new CombatSystem({ damage: vi.fn(() => []) });

    expect(() => combat.applyDamage([invalid])).toThrow(RangeError);
  });

  it('invalid command가 뒤에 있어도 batch를 부분 적용하지 않는다', () => {
    const damage = vi.fn(() => []);
    const combat = new CombatSystem({ damage });
    const commands: readonly DamageCommand[] = [
      { attackId: 'valid', targetId: 0, amount: 10 },
      { attackId: '', targetId: 1, amount: 10 },
    ];

    expect(() => combat.applyDamage(commands)).toThrow(RangeError);
    expect(damage).not.toHaveBeenCalled();
  });

  it('입력 command 배열과 object를 변경하지 않는다', () => {
    const command = Object.freeze({ attackId: 'bark:1', targetId: 7, amount: 10 });
    const commands = Object.freeze([command]);
    const combat = new CombatSystem({ damage: () => [] });

    expect(() => combat.applyDamage(commands)).not.toThrow();
    expect(commands).toEqual([command]);
  });
});

describe('GameSession bark combat integration', () => {
  const player = { x: 270, y: 650 } as const;

  it('실제 EnemySystem target을 250ms에 10 damage하고 release visual과 lifecycle을 분리한다', () => {
    const run = GameSession.create({ seed: 424242 });
    const enemyId = seedBarkTarget(run, 35);
    const events = advanceTicks(run, 15, player);

    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)?.currentHp).toBe(25);
    expect(events.filter(({ type }) => type.startsWith('bark'))).toEqual([
      { type: 'barkStarted', attackId: 'bark:1', targetId: enemyId },
      {
        type: 'barkReleased',
        attackId: 'bark:1',
        targetId: enemyId,
        origin: player,
        target: { x: 270, y: 625 },
      },
    ]);
    expect(events.map(({ type }) => type)).not.toContain('damageRequested');
  });

  it('lethal bark는 enemy death와 snack을 exactly once 누적한다', () => {
    const run = GameSession.create({ seed: 424242 });
    const enemyId = seedBarkTarget(run, 10);
    const events = advanceTicks(run, 120, player);

    expect(run.snapshot().enemies.some(({ id }) => id === enemyId)).toBe(false);
    expect(run.snapshot().snacks).toBe(1);
    expect(events.filter((event) => event.type === 'enemyDied' && event.enemyId === enemyId))
      .toEqual([{ type: 'enemyDied', enemyId }]);
    expect(events.filter((event) => event.type === 'snackEarned' && event.enemyId === enemyId))
      .toEqual([{ type: 'snackEarned', enemyId, amount: 1 }]);
  });

  it('각 cast에 unique deterministic attackId를 만들고 reset 뒤 sequence를 재현한다', () => {
    const run = GameSession.create({ seed: 424242 });
    seedBarkTarget(run, 35);

    const first = advanceTicks(run, 54, player)
      .filter((event) => event.type === 'barkStarted')
      .map(({ attackId }) => attackId);

    run.reset(424242);
    seedBarkTarget(run, 35);
    const replay = advanceTicks(run, 54, player)
      .filter((event) => event.type === 'barkStarted')
      .map(({ attackId }) => attackId);

    expect(first).toEqual(['bark:1', 'bark:2']);
    expect(replay).toEqual(first);
  });

  it('pause tick은 bark windup을 진행하지 않고 resume 뒤 남은 simulation step에서 release한다', () => {
    const run = GameSession.create({ seed: 424242 });
    seedBarkTarget(run, 35);
    const beforePause = advanceTicks(run, 10, player);
    run.forceModeForTest('skillSelection');

    expect(advanceTicks(run, 100, player)).toEqual([]);
    expect(run.snapshot().simulationMs).toBeCloseTo(10 * FIXED_STEP_MS, 12);
    run.forceModeForTest('playing');
    const afterResume = advanceTicks(run, 5, player);

    expect(beforePause.some(({ type }) => type === 'barkReleased')).toBe(false);
    expect(afterResume.filter(({ type }) => type === 'barkReleased')).toHaveLength(1);
    expect(run.snapshot().simulationMs).toBeCloseTo(250, 12);
  });
});

function seedBarkTarget(run: GameSession, currentHp: number): number {
  return run.spawnEnemyForScenario({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 625 },
    currentHp,
    maxHp: 35,
    state: 'stunned',
    stunnedMs: 60_000,
  });
}

function advanceTicks(
  run: GameSession,
  ticks: number,
  player: { readonly x: number; readonly y: number },
): readonly GameEvent[] {
  return Array.from({ length: ticks }, () => run.step(FIXED_STEP_MS, player)).flat();
}
