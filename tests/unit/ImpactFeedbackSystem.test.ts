import { describe, expect, it, vi } from 'vitest';
import type { DamageAppliedEvent } from '../../src/game/combat/CombatTypes';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  DAMAGE_MERGE_MS,
  DAMAGE_NUMBER_CAP,
  DAMAGE_NUMBER_LIFETIME_MS,
  DamageFeedbackPool,
} from '../../src/game/combat/DamageFeedbackPool';
import {
  IMPACT_STYLE,
  ImpactFeedbackSystem,
} from '../../src/game/combat/ImpactFeedbackSystem';
import { EnemyActor } from '../../src/game/enemies/EnemyActor';
import type { ImpactFeedbackTarget } from '../../src/game/enemies/ImpactFeedbackTarget';
import type { GameEvent } from '../../src/game/events/GameEvents';

describe('DamageFeedbackPool', () => {
  it('64개 actor를 BitmapText로만 preallocate하고 Text CanvasTexture를 만들지 않는다', () => {
    const observed = createDamageCreationScene();

    const pool = new DamageFeedbackPool(observed.scene as never);

    expect(pool.snapshot()).toMatchObject({ created: 64, active: 0, available: 64 });
    expect(observed.bitmapTextCreates).toHaveLength(64);
    expect(observed.bitmapTextCreates.every((args) => (
      args[0] === 0
      && args[1] === 0
      && args[2] === AssetKeys.damageNumberLight
      && args[3] === ''
      && args[4] === 13
    ))).toBe(true);
    expect(observed.textCreates).toHaveLength(0);
  });

  it('BitmapText preallocation 중간 실패는 실패 actor와 앞서 만든 actor를 모두 destroy한다', () => {
    const observed = createFailingDamageAllocationScene(2);

    expect(() => new DamageFeedbackPool(observed.scene as never))
      .toThrow('damage text init failed');

    expect(observed.created()).toBe(3);
    expect(observed.destroyed()).toBe(3);
  });

  it('workload counters는 stable scalar identity와 zero/activation/merge/reset 누적 계약을 유지한다', () => {
    const pool = createDamagePool();
    const counters = pool.workloadCounters();
    const poolInstanceId = pool.snapshot().instanceId;

    expect(pool.workloadCounters()).toBe(counters);
    expect(counters).toEqual({
      topology: 'damage/bitmap-text@1',
      poolInstanceId,
      allocatedRoots: DAMAGE_NUMBER_CAP,
      allocatedChildren: 0,
      active: 0,
      renderEligibleTexts: 0,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      stateVersion: 0,
      activations: 0,
      merges: 0,
      evictions: 0,
      expirations: 0,
      rejected: 0,
    });
    expect(Object.values(counters).every((value) => (
      typeof value === 'number' || typeof value === 'string'
    ))).toBe(true);

    expect(pool.show(hit({ effectiveAmount: 0 }))).toBe(false);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 0,
      activations: 0,
      merges: 0,
      rejected: 1,
    });

    expect(pool.show(hit({ effectiveAmount: 18 }))).toBe(true);
    expect(pool.show(hit({ effectiveAmount: 11 }))).toBe(true);
    expect(counters).toMatchObject({
      active: 1,
      renderEligibleTexts: 1,
      stateVersion: 2,
      activations: 1,
      merges: 1,
      rejected: 1,
    });

    pool.reset();

    expect(pool.workloadCounters()).toBe(counters);
    expect(counters).toMatchObject({
      poolInstanceId,
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 3,
      activations: 1,
      merges: 1,
      rejected: 1,
    });
  });

  it('step workload는 전체 성공 후 start active/visible visits와 350ms expiration을 누적한다', () => {
    const pool = createDamagePool();
    const counters = pool.workloadCounters();
    pool.show(hit());

    pool.step(349.999);

    expect(counters).toMatchObject({
      active: 1,
      renderEligibleTexts: 1,
      stepPasses: 1,
      activeActorVisits: 1,
      visibleDrawableVisits: 1,
      stateVersion: 2,
      expirations: 0,
    });

    pool.step(0.001);

    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stepPasses: 2,
      activeActorVisits: 2,
      visibleDrawableVisits: 2,
      stateVersion: 3,
      expirations: 1,
    });
  });

  it('65번째 activation은 기존 cap과 pool identity를 유지하며 eviction을 한 번만 누적한다', () => {
    const pool = createDamagePool();
    const counters = pool.workloadCounters();
    const poolInstanceId = counters.poolInstanceId;
    for (let index = 0; index < DAMAGE_NUMBER_CAP; index += 1) {
      pool.show(hit({ castId: `fill:${index}`, targetId: index }));
    }

    pool.show(hit({ castId: 'overflow', targetId: 1_000, strength: 'heavy' }));

    expect(pool.snapshot()).toMatchObject({
      instanceId: poolInstanceId,
      created: DAMAGE_NUMBER_CAP,
      active: DAMAGE_NUMBER_CAP,
      available: 0,
    });
    expect(counters).toMatchObject({
      poolInstanceId,
      active: DAMAGE_NUMBER_CAP,
      renderEligibleTexts: DAMAGE_NUMBER_CAP,
      stateVersion: DAMAGE_NUMBER_CAP + 2,
      activations: DAMAGE_NUMBER_CAP + 1,
      evictions: 1,
      expirations: 0,
      rejected: 0,
    });
  });

  it('acquire 후 BitmapText activation이 throw하면 reset/release로 slot을 원자 rollback한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const initial = pool.snapshot();
    const counters = pool.workloadCounters();
    observed.failNext('setVisible');

    expect(() => pool.show(hit())).toThrow('BitmapText setVisible failed');

    expect(pool.snapshot()).toEqual(initial);
    expect(pool.active()).toEqual([]);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 1,
      activations: 0,
      rejected: 1,
    });

    expect(pool.show(hit())).toBe(true);
    expect(pool.snapshot()).toMatchObject({ active: 1, available: DAMAGE_NUMBER_CAP - 1 });
    expect(pool.active()).toHaveLength(1);
    expect(counters).toMatchObject({
      active: 1,
      renderEligibleTexts: 1,
      stateVersion: 2,
      activations: 1,
      rejected: 1,
    });
  });

  it('fresh activation과 reset rollback이 함께 실패하면 root-first AggregateError와 slot을 보존한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const initial = pool.snapshot();
    const counters = pool.workloadCounters();
    const activationFailure = new Error('damage activation failed');
    const rollbackFailure = new Error('damage activation rollback failed');
    observed.failNext('setFont', activationFailure);
    observed.failNext('setPosition', rollbackFailure);

    let thrown: unknown;
    try {
      pool.show(hit());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors[0]).toBe(activationFailure);
    expect((thrown as AggregateError).errors[1]).toBe(rollbackFailure);
    expect(observed.pendingFailures()).toBe(0);
    expect(pool.snapshot()).toEqual(initial);
    expect(pool.active()).toEqual([]);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      activations: 0,
      rejected: 1,
    });
    expect(pool.show(hit({ targetId: 8 }))).toBe(true);
  });

  it('cap eviction replacement activation이 throw해도 기존 64 actors와 pool slot을 원자 보존한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    for (let index = 0; index < DAMAGE_NUMBER_CAP; index += 1) {
      pool.show(hit({ castId: `fill:${index}`, targetId: index }));
    }
    const beforePool = pool.snapshot();
    const beforeActors = pool.active();
    observed.failNext('setFont');

    expect(() => pool.show(hit({
      castId: 'failed-overflow',
      targetId: 1_000,
      strength: 'heavy',
    }))).toThrow('BitmapText setFont failed');

    expect(pool.snapshot()).toEqual(beforePool);
    expect(pool.active()).toEqual(beforeActors);
    expect(counters).toMatchObject({
      active: DAMAGE_NUMBER_CAP,
      renderEligibleTexts: DAMAGE_NUMBER_CAP,
      activations: DAMAGE_NUMBER_CAP,
      evictions: 0,
      rejected: 1,
    });

    expect(pool.show(hit({
      castId: 'successful-overflow',
      targetId: 1_001,
      strength: 'heavy',
    }))).toBe(true);
    expect(pool.snapshot()).toEqual(beforePool);
    expect(pool.active()).toHaveLength(DAMAGE_NUMBER_CAP);
    expect(counters).toMatchObject({
      active: DAMAGE_NUMBER_CAP,
      renderEligibleTexts: DAMAGE_NUMBER_CAP,
      activations: DAMAGE_NUMBER_CAP + 1,
      evictions: 1,
      rejected: 1,
    });
  });

  it('merge setter가 throw하면 기존 damage state를 복원하고 retry를 exact-once 적용한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    pool.show(hit({ effectiveAmount: 18 }));
    pool.step(50);
    const beforeMerge = pool.active();
    observed.failNext('setFont');

    expect(() => pool.show(hit({ effectiveAmount: 11 })))
      .toThrow('BitmapText setFont failed');

    expect(pool.active()).toEqual(beforeMerge);
    expect(counters).toMatchObject({
      active: 1,
      activations: 1,
      merges: 0,
      rejected: 1,
    });

    expect(pool.show(hit({ effectiveAmount: 11 }))).toBe(true);
    expect(pool.active()).toEqual([
      expect.objectContaining({ amount: 29, text: '29', ageMs: 0 }),
    ]);
    expect(counters).toMatchObject({
      active: 1,
      activations: 1,
      merges: 1,
      rejected: 1,
    });
  });

  it('expiration reset setter가 throw해도 collection과 pool slot 및 workload gauge를 함께 회수한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    const initial = pool.snapshot();
    const resetFailure = new Error('damage expiration reset failed');
    pool.show(hit());
    observed.failNext('removeAllListeners', resetFailure);

    let thrown: unknown;
    try {
      pool.step(DAMAGE_NUMBER_LIFETIME_MS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(resetFailure);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual(initial);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 2,
      expirations: 1,
    });
    expect(pool.show(hit({ targetId: 8 }))).toBe(true);
  });

  it('reset의 early/late setter가 한 번씩 throw하면 모두 시도한 뒤 재정리해 첫 오류를 보존한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    const initial = pool.snapshot();
    const firstFailure = new Error('damage reset removeAllListeners failed');
    const lateFailure = new Error('damage reset setVisible failed');
    pool.show(hit());
    observed.failNext('removeAllListeners', firstFailure);
    observed.failNext('setVisible', lateFailure);

    let thrown: unknown;
    try {
      pool.reset();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstFailure);
    expect(observed.pendingFailures()).toBe(0);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual(initial);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 2,
    });
  });

  it('visible reset이 재시도까지 실패하면 actor를 격리하고 다음 reset에서 다시 회수한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    const initial = pool.snapshot();
    pool.show(hit());
    observed.failNext('setVisible', new Error('damage visible reset failed'));
    observed.failNext('setVisible', new Error('damage visible retry failed'));

    expect(() => pool.reset()).toThrow(AggregateError);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual({ ...initial, active: 1, available: 63 });
    expect(counters).toMatchObject({ active: 0, renderEligibleTexts: 1 });

    expect(() => pool.reset()).not.toThrow();
    expect(pool.snapshot()).toEqual(initial);
    expect(counters).toMatchObject({ active: 0, renderEligibleTexts: 0 });
  });

  it('reset batch는 모든 actor slot을 회수하고 첫 reset 오류 identity를 보존한다', () => {
    const observed = createArmedFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const counters = pool.workloadCounters();
    const initial = pool.snapshot();
    const firstFailure = new Error('first damage reset failed');
    const secondFailure = new Error('second damage reset failed');
    pool.show(hit({ targetId: 7 }));
    pool.show(hit({ targetId: 8 }));
    observed.failNext('removeAllListeners', firstFailure);
    observed.failNext('removeAllListeners', secondFailure);

    let thrown: unknown;
    try {
      pool.reset();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstFailure);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual(initial);
    expect(counters).toMatchObject({
      active: 0,
      renderEligibleTexts: 0,
      stateVersion: 4,
    });
    expect(pool.show(hit({ targetId: 9 }))).toBe(true);
  });

  it('각 pooled actor의 fixed overlay origin/depth는 생성 시 한 번만 설정하고 activation은 liveness만 복원한다', () => {
    const observed = createInspectableDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);

    expect(observed.callsForEachActor('setOrigin')).toEqual(
      Array.from({ length: DAMAGE_NUMBER_CAP }, () => [[0.5, 1]]),
    );
    expect(observed.callsForEachActor('setDepth')).toEqual(
      Array.from({ length: DAMAGE_NUMBER_CAP }, () => [[2000]]),
    );

    observed.clear();
    pool.show(hit({ position: { x: 20, y: 100 } }));

    expect(observed.callsFor('setOrigin')).toEqual([]);
    expect(observed.callsFor('setDepth')).toEqual([]);
    expect(observed.callsFor('setActive')).toEqual([[true]]);
    expect(observed.callsFor('setVisible')).toEqual([[true]]);
  });

  it('exact style과 cap/lifetime 계약을 고정한다', () => {
    expect({ DAMAGE_NUMBER_CAP, DAMAGE_MERGE_MS, DAMAGE_NUMBER_LIFETIME_MS }).toEqual({
      DAMAGE_NUMBER_CAP: 64,
      DAMAGE_MERGE_MS: 120,
      DAMAGE_NUMBER_LIFETIME_MS: 350,
    });
    expect(IMPACT_STYLE).toEqual({
      light: { flashMs: 45, recoilPx: 2, popScale: 1.03, fontPx: 13, risePx: 18, color: '#fff0c2' },
      medium: { flashMs: 60, recoilPx: 3, popScale: 1.06, fontPx: 17, risePx: 24, color: '#f2a24a' },
      heavy: { flashMs: 90, recoilPx: 5, popScale: 1.08, fontPx: 24, risePx: 32, color: '#ffe066' },
    });
  });

  it('fixed step은 logical age만 갱신하고 여러 step의 최종 motion을 RAF render 한 번에 반영한다', () => {
    const observed = createInspectableDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const initial = pool.snapshot();
    pool.show(hit({ position: { x: 20, y: 100 }, strength: 'light' }));
    observed.clear();

    pool.step(16.67);
    pool.step(16.67);

    for (const setter of [
      'setText', 'setFont', 'setOrigin', 'setDepth', 'setActive', 'setVisible',
      'setPosition', 'setScale', 'setAlpha',
    ]) {
      expect(observed.callsFor(setter), setter).toEqual([]);
    }
    expect(pool.active()[0]).toMatchObject({ ageMs: 33.34, position: { x: 20 } });

    pool.render();

    expect(observed.callsFor('setPosition')).toEqual([[20, expect.closeTo(98.2854, 4)]]);
    expect(observed.callsFor('setAlpha')).toEqual([[expect.closeTo(0.9047, 4)]]);
    expect(observed.callsFor('setScale')).toEqual([[expect.closeTo(1.0078, 4)]]);

    observed.clear();
    pool.render();
    expect(observed.callsFor('setPosition')).toEqual([]);
    expect(observed.callsFor('setScale')).toEqual([]);
    expect(observed.callsFor('setAlpha')).toEqual([]);

    pool.step(DAMAGE_NUMBER_LIFETIME_MS - pool.active()[0]!.ageMs);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual(initial);
  });

  it.each([
    ['light', 98.4571428571, 1.01],
    ['medium', 97.9428571429, 1.03],
    ['heavy', 97.2571428571, 1.0533333333],
  ] as const)('%s RAF render는 position을 한 번만 계산하고 exact rise/alpha/scale을 유지한다', (
    strength,
    expectedY,
    expectedScale,
  ) => {
    const observed = createInspectableDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    pool.show(hit({ position: { x: 20, y: 100 }, strength }));
    const position = vi.spyOn(activeDamageActor(pool), 'position');
    observed.clear();

    pool.step(30);
    expect(position).not.toHaveBeenCalled();
    pool.render();

    expect(position).toHaveBeenCalledTimes(1);
    expect(observed.callsFor('setPosition')).toEqual([[20, expect.closeTo(expectedY, 10)]]);
    expect(observed.callsFor('setAlpha')).toEqual([[expect.closeTo(0.9142857143, 10)]]);
    expect(observed.callsFor('setScale')).toEqual([[expect.closeTo(expectedScale, 10)]]);
  });

  it('RAF setter 하나가 실패해도 나머지 actor를 렌더하고 실패 actor만 다음 RAF에 재시도한다', () => {
    const observed = createRenderFailureDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    pool.show(hit({ targetId: 7 }));
    pool.show(hit({ targetId: 8 }));
    pool.step(30);
    const renderFailure = new Error('first damage render failed');
    observed.failNextPosition(renderFailure);

    expect(() => pool.render()).toThrow(renderFailure);

    expect(pool.active()).toHaveLength(2);
    expect(observed.renderPositionCalls()).toBe(2);

    pool.render();

    expect(observed.renderPositionCalls()).toBe(3);
  });

  it.each([
    ['same-strength', 'light', 'light', 'light', AssetKeys.damageNumberLight, 13, DAMAGE_MERGE_MS],
    ['strength-upgrade', 'light', 'medium', 'medium', AssetKeys.damageNumberMedium, 17, 50],
    ['heavy-to-light', 'heavy', 'light', 'heavy', AssetKeys.damageNumberHeavy, 24, 50],
  ] as const)('%s merge는 content/font/latest-anchor motion만 정확히 한 번 갱신한다', (
    _case,
    initialStrength,
    incomingStrength,
    expectedStrength,
    expectedFontKey,
    expectedFontPx,
    elapsedMs,
  ) => {
    const observed = createInspectableDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    pool.show(hit({ effectiveAmount: 18, strength: initialStrength }));
    pool.step(elapsedMs);
    observed.clear();

    pool.show(hit({
      effectiveAmount: 11,
      strength: incomingStrength,
      position: { x: 44, y: 88 },
    }));

    expect(observed.callsFor('setText')).toEqual([['29']]);
    expect(observed.callsFor('setFont')).toEqual([[expectedFontKey, expectedFontPx]]);
    for (const setter of ['setOrigin', 'setDepth', 'setActive', 'setVisible']) {
      expect(observed.callsFor(setter), setter).toEqual([]);
    }
    expect(observed.callsFor('setPosition')).toEqual([[44, 88]]);
    expect(observed.callsFor('setScale')).toEqual([[IMPACT_STYLE[expectedStrength].popScale]]);
    expect(observed.callsFor('setAlpha')).toEqual([[1]]);
    expect(pool.active()[0]).toMatchObject({
      amount: 29,
      strength: expectedStrength,
      position: { x: 44, y: 88 },
      ageMs: 0,
    });

    observed.clear();
    pool.step(16.67);
    for (const setter of ['setText', 'setFont', 'setOrigin', 'setDepth', 'setActive', 'setVisible']) {
      expect(observed.callsFor(setter), setter).toEqual([]);
    }
  });

  it('349.999ms까지 유지하고 정확히 350ms에 release한 actor를 fixed setter 없이 재활성화한다', () => {
    const observed = createInspectableDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    pool.show(hit({ targetId: 7, position: { x: 20, y: 100 } }));
    const actorId = pool.active()[0]!.actorId;
    observed.clear();

    pool.step(349.999);

    expect(pool.active()).toEqual([
      expect.objectContaining({ actorId, ageMs: 349.999 }),
    ]);
    expect(observed.callsFor('setPosition')).toEqual([]);
    expect(observed.callsFor('setScale')).toEqual([]);
    expect(observed.callsFor('setAlpha')).toEqual([]);
    expect(observed.callsFor('setActive')).toEqual([]);
    expect(observed.callsFor('setVisible')).toEqual([]);

    observed.clear();
    pool.step(0.001);

    expect(pool.active()).toEqual([]);
    expect(observed.callsFor('setActive')).toEqual([[false]]);
    expect(observed.callsFor('setVisible')).toEqual([[false]]);

    observed.clear();
    pool.show(hit({ targetId: 8, position: { x: 44, y: 88 }, strength: 'heavy' }));

    expect(pool.active()).toEqual([
      expect.objectContaining({ actorId, targetId: 8, position: { x: 44, y: 88 }, ageMs: 0 }),
    ]);
    expect(observed.callsFor('setOrigin')).toEqual([]);
    expect(observed.callsFor('setDepth')).toEqual([]);
    expect(observed.callsFor('setActive')).toEqual([[true]]);
    expect(observed.callsFor('setVisible')).toEqual([[true]]);
    expect(observed.callsFor('setText')).toEqual([['18']]);
    expect(observed.callsFor('setFont')).toEqual([[AssetKeys.damageNumberHeavy, 24]]);
    expect(observed.callsFor('setPosition')).toEqual([[44, 88]]);
    expect(observed.callsFor('setScale')).toEqual([[1.08]]);
    expect(observed.callsFor('setAlpha')).toEqual([[1]]);
  });

  it('같은 target의 inclusive 120ms effectiveAmount를 합치고 최신 위치/최대 strength/lethal을 유지한다', () => {
    const pool = createDamagePool();
    pool.show(hit({ targetId: 7, amount: 99, effectiveAmount: 18, strength: 'light' }));
    pool.step(120);
    pool.show(hit({
      targetId: 7,
      amount: 99,
      effectiveAmount: 11,
      strength: 'medium',
      lethal: true,
      position: { x: 44, y: 88 },
    }));

    expect(pool.active()).toEqual([
      expect.objectContaining({
        targetId: 7,
        text: '29',
        amount: 29,
        strength: 'medium',
        lethal: true,
        position: { x: 44, y: 88 },
        ageMs: 0,
      }),
    ]);

    pool.show(hit({ targetId: 7, effectiveAmount: 971, strength: 'light' }));
    expect(pool.active()).toEqual([
      expect.objectContaining({
        text: '1000',
        amount: 1000,
        strength: 'medium',
        ageMs: 0,
      }),
    ]);
  });

  it('120ms를 넘긴 같은 target은 새 숫자를 쓰고 350ms 경계에 반환한다', () => {
    const pool = createDamagePool();
    const initial = pool.snapshot();
    pool.show(hit({ targetId: 7 }));
    pool.step(120.001);
    pool.show(hit({ targetId: 7 }));
    expect(pool.active()).toHaveLength(2);

    pool.step(229.999);
    expect(pool.active()).toHaveLength(1);
    pool.step(120.001);
    expect(pool.snapshot()).toEqual(initial);
  });

  it('350ms 선형 rise를 사용한다', () => {
    const pool = createDamagePool();
    pool.show(hit({ targetId: 8, position: { x: 20, y: 100 }, strength: 'heavy' }));
    pool.step(175);
    expect(pool.active()[0]).toMatchObject({ position: { x: 20, y: 84 } });
  });

  it('cap에서 가장 오래된 light를 먼저 회수하고 없으면 가장 오래된 항목을 회수한다', () => {
    const pool = createDamagePool();
    for (let index = 0; index < DAMAGE_NUMBER_CAP; index += 1) {
      pool.show(hit({
        castId: `cast:${index}`,
        targetId: index,
        strength: index === 5 ? 'light' : 'heavy',
      }));
      pool.step(1);
    }
    pool.show(hit({ castId: 'overflow:1', targetId: 1000, strength: 'medium' }));
    expect(pool.active().some(({ targetId }) => targetId === 5)).toBe(false);
    expect(pool.active().some(({ targetId }) => targetId === 0)).toBe(true);

    pool.reset();
    for (let index = 0; index < DAMAGE_NUMBER_CAP; index += 1) {
      pool.show(hit({ castId: `heavy:${index}`, targetId: index, strength: 'heavy' }));
      pool.step(1);
    }
    pool.show(hit({ castId: 'overflow:2', targetId: 1001, strength: 'medium' }));
    expect(pool.active().some(({ targetId }) => targetId === 0)).toBe(false);
  });

  it('cap eviction 후보는 64개 actor를 정렬·복사하지 않고 한 번 순회해 고른다', () => {
    const pool = createDamagePool();
    for (let index = 0; index < DAMAGE_NUMBER_CAP; index += 1) {
      pool.show(hit({
        castId: `one-pass:${index}`,
        targetId: index,
        strength: index === 5 ? 'light' : 'heavy',
      }));
    }
    const sort = vi.spyOn(Array.prototype, 'sort');
    try {
      pool.show(hit({ castId: 'one-pass:overflow', targetId: 1000, strength: 'medium' }));
      expect(sort).not.toHaveBeenCalled();
    } finally {
      sort.mockRestore();
    }
    expect(pool.active().some(({ targetId }) => targetId === 5)).toBe(false);
  });

  it('reset은 64개 preallocation과 pool identity를 유지한다', () => {
    const pool = createDamagePool();
    const initial = pool.snapshot();
    pool.show(hit());
    pool.reset();
    expect(pool.snapshot()).toEqual(initial);
  });

  it('DisplayList SHUTDOWN 후 fontData가 null이어도 reset은 BitmapText text를 건드리지 않고 slot을 재사용한다', () => {
    const observed = createShutdownDamageScene();
    const pool = new DamageFeedbackPool(observed.scene as never);
    const initial = pool.snapshot();
    observed.clear();
    pool.show(hit({ effectiveAmount: 18 }));
    observed.destroyFontData();

    expect(() => pool.reset()).not.toThrow();

    expect(pool.snapshot()).toEqual(initial);
    expect(pool.active()).toEqual([]);
    expect(observed.callsFor('setText')).toEqual([['18']]);

    observed.restoreFontData();
    expect(pool.show(hit({ targetId: 8, effectiveAmount: 11 }))).toBe(true);
    expect(pool.active()).toEqual([
      expect.objectContaining({ targetId: 8, text: '11', amount: 11 }),
    ]);
    expect(observed.callsFor('setText')).toEqual([['18'], ['11']]);
  });

  it('effectiveAmount 0은 slot을 만들지 않는다', () => {
    const pool = createDamagePool();
    const initial = pool.snapshot();
    expect(pool.show(hit({ amount: 99, effectiveAmount: 0, lethal: true }))).toBe(false);
    expect(pool.active()).toEqual([]);
    expect(pool.snapshot()).toEqual(initial);
  });
});

describe('ImpactFeedbackSystem', () => {
  it('적/후추 모두 impact 반대 방향으로 recoil하고 후추는 enemy lookup을 사용하지 않는다', () => {
    const enemyTarget = fakeTarget();
    const playerTarget = fakeTarget();
    const enemyTargetLookup = vi.fn(() => enemyTarget);
    const feedback = new ImpactFeedbackSystem({ enemyTarget: enemyTargetLookup, playerTarget });

    feedback.handle(hit({ targetId: 8, impactDirection: { x: 1, y: 0 } }));
    feedback.handle(playerHit({ impactDirection: { x: 0, y: -1 } }));

    expect(enemyTarget.lastRecoil?.direction).toEqual({ x: -1, y: -0 });
    expect(playerTarget.lastRecoil?.direction).toEqual({ x: -0, y: 1 });
    expect(enemyTargetLookup).toHaveBeenCalledTimes(1);
  });

  it('꼬리치기 적 리코일은 후추에서 대상 쪽으로 바깥쪽을 향한다', () => {
    const east = fakeTarget();
    const centered = fakeTarget();
    const targets = new Map([[7, east], [8, centered]]);
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: (targetId) => targets.get(targetId),
      playerTarget: fakeTarget(),
    });

    feedback.handle(hit({
      targetId: 7,
      source: 'tailSwipe',
      strength: 'medium',
      position: { x: 300, y: 480 },
      impactDirection: { x: 0, y: -1 },
    }));
    feedback.handle(hit({
      castId: 'tail:center',
      targetId: 8,
      source: 'tailSwipe',
      strength: 'medium',
      position: { x: 270, y: 480 },
      impactDirection: { x: 1, y: 0 },
    }));

    expect(east.lastRecoil?.direction).toEqual({ x: 0, y: -1 });
    expect(centered.lastRecoil?.direction).toEqual({ x: 1, y: 0 });
  });

  it('reduced motion은 rule state를 바꾸지 않고 camera=0/recoil 절반/pop delta 절반만 적용한다', () => {
    const normalTarget = fakeTarget();
    const reducedTarget = fakeTarget();
    const normalCamera = { shake: vi.fn() };
    const reducedCamera = { shake: vi.fn() };
    const event = hit({ source: 'aquaBeam', strength: 'heavy' });

    new ImpactFeedbackSystem({
      enemyTarget: () => normalTarget,
      playerTarget: fakeTarget(),
      camera: normalCamera,
      reducedMotion: () => false,
    }).handle(event);
    new ImpactFeedbackSystem({
      enemyTarget: () => reducedTarget,
      playerTarget: fakeTarget(),
      camera: reducedCamera,
      reducedMotion: () => true,
    }).handle(event);

    expect(normalTarget.lastRecoil).toMatchObject({ distancePx: 5, popScale: 1.08 });
    expect(reducedTarget.lastRecoil).toMatchObject({ distancePx: 2.5, popScale: 1.04 });
    expect(normalCamera.shake).toHaveBeenCalledWith(90, 0.0035);
    expect(reducedCamera.shake).not.toHaveBeenCalled();
  });

  it('camera/composite burst는 castId당 한 번이고 bark/deokbae는 camera를 흔들지 않는다', () => {
    const camera = { shake: vi.fn() };
    const compositeBurst = vi.fn();
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => fakeTarget(),
      playerTarget: fakeTarget(),
      camera,
      compositeBurst,
    });

    feedback.handle(hit({ castId: 'aqua:1', source: 'aquaBeam', strength: 'heavy', targetId: 1 }));
    feedback.handle(hit({ castId: 'aqua:1', source: 'aquaBeam', strength: 'heavy', targetId: 2 }));
    feedback.handle(hit({ castId: 'bark:1', source: 'bark', targetId: 3 }));
    feedback.handle(hit({ castId: 'deokbae:1', source: 'deokbae', targetId: 4 }));

    expect(camera.shake).toHaveBeenCalledTimes(1);
    expect(compositeBurst).toHaveBeenCalledTimes(3);
    feedback.reset();
    feedback.handle(hit({ castId: 'aqua:1', source: 'aquaBeam', strength: 'heavy' }));
    expect(camera.shake).toHaveBeenCalledTimes(2);
  });

  it('lethal은 target beginDeath 뒤 lookup 제거 callback을 즉시 호출한다', () => {
    const target = fakeTarget();
    const removeLethalTarget = vi.fn();
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => target,
      playerTarget: fakeTarget(),
      removeLethalTarget,
    });

    feedback.handle(hit({ lethal: true }));

    expect(target.deathDurations).toEqual([160]);
    expect(removeLethalTarget).toHaveBeenCalledWith(7);
  });

  it('active label damageAnchor에서 숫자를 시작하고 merge/lethal도 최신 anchor와 actor identity를 유지한다', () => {
    const pool = createDamagePool();
    const target = fakeTarget();
    let damageAnchor: { x: number; y: number } | undefined = { x: 20, y: 72 };
    const enemyDamageAnchor = vi.fn(() => damageAnchor);
    const removeLethalTarget = vi.fn(() => { damageAnchor = undefined; });
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => target,
      enemyDamageAnchor,
      playerTarget: fakeTarget(),
      damageNumbers: pool,
      removeLethalTarget,
    });

    feedback.handle(hit({ targetId: 7, effectiveAmount: 18, position: { x: 20, y: 100 } }));
    const actorId = pool.active()[0]!.actorId;
    feedback.step(60);
    damageAnchor = { x: 24, y: 68 };
    feedback.handle(hit({
      targetId: 7,
      effectiveAmount: 11,
      position: { x: 24, y: 110 },
      strength: 'heavy',
      lethal: true,
    }));

    expect(pool.active()).toEqual([
      expect.objectContaining({
        actorId,
        amount: 29,
        position: { x: 24, y: 68 },
        ageMs: 0,
        strength: 'heavy',
        lethal: true,
      }),
    ]);
    expect(enemyDamageAnchor).toHaveBeenCalledTimes(2);
    expect(removeLethalTarget).toHaveBeenCalledWith(7);
  });

  it('active label view를 찾지 못하면 damageApplied foot position으로 안전하게 fallback한다', () => {
    const pool = createDamagePool();
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => undefined,
      enemyDamageAnchor: () => undefined,
      playerTarget: fakeTarget(),
      damageNumbers: pool,
    });

    feedback.handle(hit({ targetId: 404, position: { x: 77, y: 133 } }));

    expect(pool.active()[0]).toMatchObject({
      targetId: 404,
      position: { x: 77, y: 133 },
    });
  });

  it('effectiveAmount 0은 number/death/camera/composite/target feedback 전체를 no-op한다', () => {
    const pool = createDamagePool();
    const target = fakeTarget();
    const player = fakeTarget();
    const camera = { shake: vi.fn() };
    const compositeBurst = vi.fn();
    const removeLethalTarget = vi.fn();
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => target,
      playerTarget: player,
      damageNumbers: pool,
      camera,
      compositeBurst,
      removeLethalTarget,
    });

    feedback.handle(hit({
      source: 'aquaBeam', strength: 'heavy', amount: 30, effectiveAmount: 0, lethal: true,
    }));
    feedback.handle(playerHit({ effectiveAmount: 0 }));

    expect(pool.active()).toEqual([]);
    expect(target.flashDurations).toEqual([]);
    expect(target.lastRecoil).toBeUndefined();
    expect(target.deathDurations).toEqual([]);
    expect(player.flashDurations).toEqual([]);
    expect(camera.shake).not.toHaveBeenCalled();
    expect(compositeBurst).not.toHaveBeenCalled();
    expect(removeLethalTarget).not.toHaveBeenCalled();
  });

  it('resetDedupe는 damage producer를 건드리지 않고 reset만 정확히 한 번 reset한다', () => {
    const damageNumbers = {
      show: vi.fn(), showPlayer: vi.fn(), step: vi.fn(), render: vi.fn(), reset: vi.fn(),
    } as unknown as DamageFeedbackPool;
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => fakeTarget(),
      playerTarget: fakeTarget(),
      damageNumbers,
    });

    feedback.resetDedupe();
    expect(damageNumbers.reset).not.toHaveBeenCalled();
    feedback.reset();
    expect(damageNumbers.reset).toHaveBeenCalledTimes(1);
  });

  it('fixed step과 RAF render를 damage producer의 분리된 API로 위임한다', () => {
    const damageNumbers = {
      show: vi.fn(), showPlayer: vi.fn(), step: vi.fn(), render: vi.fn(), reset: vi.fn(),
    } as unknown as DamageFeedbackPool;
    const feedback = new ImpactFeedbackSystem({
      enemyTarget: () => fakeTarget(),
      playerTarget: fakeTarget(),
      damageNumbers,
    });

    feedback.step(16.67);
    feedback.step(16.67);

    expect(damageNumbers.step).toHaveBeenCalledTimes(2);
    expect(damageNumbers.render).not.toHaveBeenCalled();

    feedback.render();

    expect(damageNumbers.render).toHaveBeenCalledOnce();
  });
});

it('EnemyActor dying view는 159ms까지 active이고 정확히 160ms에 release를 요청한다', () => {
  const actor = new EnemyActor(createActorScene() as never);
  actor.beginDeath(160);
  expect(actor.stepDeath(159)).toBe('active');
  expect(actor.stepDeath(1)).toBe('release');
});

it('EnemyActor feedback은 stepped clock으로 flash/recoil/pop을 끝내며 Phaser timer를 만들지 않는다', () => {
  const scene = createActorScene();
  const actor = new EnemyActor(scene as never);
  actor.flash(60);
  actor.recoil({ direction: { x: -1, y: 0 }, distancePx: 3, popScale: 1.06, durationMs: 60 });
  expect(actor.feedbackSnapshot()).toMatchObject({
    flashRemainingMs: 60,
    recoilRemainingMs: 60,
    recoilOffset: { x: -3, y: 0 },
    popScale: 1.06,
  });
  actor.stepFeedback(60);
  expect(actor.feedbackSnapshot()).toMatchObject({
    flashRemainingMs: 0,
    recoilRemainingMs: 0,
    recoilOffset: { x: 0, y: 0 },
    popScale: 1,
  });
  expect(scene.tweenAdd).not.toHaveBeenCalled();
});

function createDamagePool(): DamageFeedbackPool {
  return new DamageFeedbackPool(createDamageScene() as never);
}

function activeDamageActor(pool: DamageFeedbackPool): { position: () => { readonly x: number; readonly y: number } } {
  return (pool as unknown as {
    readonly activeActors: Array<{ position: () => { readonly x: number; readonly y: number } }>;
  }).activeActors[0]!;
}

function hit(overrides: Partial<DamageAppliedEvent> = {}): DamageAppliedEvent {
  return {
    type: 'damageApplied',
    castId: 'cast:1',
    appliedAtStep: 1,
    targetId: 7,
    amount: 18,
    effectiveAmount: 18,
    position: { x: 20, y: 100 },
    impactDirection: { x: 1, y: 0 },
    source: 'bark',
    strength: 'light',
    lethal: false,
    ...overrides,
  };
}

function playerHit(overrides: Partial<Extract<GameEvent, { type: 'playerDamaged' }>> = {}): Extract<GameEvent, { type: 'playerDamaged' }> {
  return {
    type: 'playerDamaged',
    castId: 'enemy:1:1',
    appliedAtStep: 1,
    sourceEnemyId: 1,
    sourceEnemyKind: 'offLeashGuardian',
    amount: 10,
    effectiveAmount: 10,
    hp: 990,
    maxHp: 1000,
    lethal: false,
    position: { x: 270, y: 650 },
    impactDirection: { x: 0, y: -1 },
    strength: 'medium',
    ...overrides,
  };
}

function fakeTarget(): ImpactFeedbackTarget & {
  lastRecoil?: Parameters<ImpactFeedbackTarget['recoil']>[0];
  readonly deathDurations: number[];
  readonly flashDurations: number[];
} {
  return {
    deathDurations: [],
    flashDurations: [],
    getFeedbackAnchor: () => ({ x: 0, y: 0 }),
    flash(durationMs) { this.flashDurations.push(durationMs); },
    recoil(input) { this.lastRecoil = input; },
    beginDeath(durationMs) { this.deathDurations.push(durationMs); },
  };
}

function createDamageScene(): object {
  const text = (): object => {
    const proxy = new Proxy({}, { get: () => (..._args: unknown[]) => proxy });
    return proxy;
  };
  return { add: { bitmapText: text } };
}

function createArmedFailureDamageScene(): {
  readonly scene: object;
  readonly failNext: (setter: string, error?: Error) => void;
  readonly pendingFailures: () => number;
} {
  const failures: Array<{ readonly setter: string; readonly error: Error }> = [];
  const bitmapText = (): object => {
    const proxy = new Proxy({}, {
      get: (_target, property) => (..._args: unknown[]) => {
        const setter = String(property);
        if (setter === failures[0]?.setter) {
          throw failures.shift()!.error;
        }
        return proxy;
      },
    });
    return proxy;
  };
  return {
    scene: { add: { bitmapText } },
    failNext: (setter, error = new Error(`BitmapText ${setter} failed`)) => {
      failures.push({ setter, error });
    },
    pendingFailures: () => failures.length,
  };
}

function createDamageCreationScene(): {
  readonly scene: object;
  readonly bitmapTextCreates: unknown[][];
  readonly textCreates: unknown[][];
} {
  const bitmapTextCreates: unknown[][] = [];
  const textCreates: unknown[][] = [];
  const object = (): object => {
    const proxy = new Proxy({}, { get: () => (..._args: unknown[]) => proxy });
    return proxy;
  };
  return {
    scene: {
      add: {
        bitmapText: (...args: unknown[]) => {
          bitmapTextCreates.push(args);
          return object();
        },
        text: (...args: unknown[]) => {
          textCreates.push(args);
          return object();
        },
      },
    },
    bitmapTextCreates,
    textCreates,
  };
}

function createFailingDamageAllocationScene(failAt: number): {
  readonly scene: object;
  readonly created: () => number;
  readonly destroyed: () => number;
} {
  let created = 0;
  let destroyed = 0;
  const bitmapText = (): object => {
    const index = created;
    created += 1;
    const proxy = new Proxy({}, {
      get: (_target, property) => (..._args: unknown[]) => {
        const setter = String(property);
        if (setter === 'setOrigin' && index === failAt) {
          throw new Error('damage text init failed');
        }
        if (setter === 'destroy') destroyed += 1;
        return proxy;
      },
    });
    return proxy;
  };
  return {
    scene: { add: { bitmapText } },
    created: () => created,
    destroyed: () => destroyed,
  };
}

function createInspectableDamageScene(): {
  readonly scene: object;
  readonly callsFor: (setter: string) => readonly (readonly unknown[])[];
  readonly callsForEachActor: (setter: string) => readonly (readonly (readonly unknown[])[])[];
  readonly clear: () => void;
} {
  const calls = new Map<string, unknown[][]>();
  const callsByActor: Map<string, unknown[][]>[] = [];
  const bitmapText = (): object => {
    const actorCalls = new Map<string, unknown[][]>();
    callsByActor.push(actorCalls);
    const proxy = new Proxy({}, {
      get: (_target, property) => (...args: unknown[]) => {
        const setter = String(property);
        const recorded = calls.get(setter) ?? [];
        recorded.push(args);
        calls.set(setter, recorded);
        const actorRecorded = actorCalls.get(setter) ?? [];
        actorRecorded.push(args);
        actorCalls.set(setter, actorRecorded);
        return proxy;
      },
    });
    return proxy;
  };
  return {
    scene: { add: { bitmapText } },
    callsFor: (setter) => calls.get(setter) ?? [],
    callsForEachActor: (setter) => callsByActor.map((actorCalls) => actorCalls.get(setter) ?? []),
    clear: () => {
      calls.clear();
      for (const actorCalls of callsByActor) actorCalls.clear();
    },
  };
}

function createRenderFailureDamageScene(): {
  readonly scene: object;
  readonly failNextPosition: (error: Error) => void;
  readonly renderPositionCalls: () => number;
} {
  let armedFailure: Error | undefined;
  let renderPositionCalls = 0;
  const bitmapText = (): object => {
    const proxy = new Proxy({}, {
      get: (_target, property) => (..._args: unknown[]) => {
        if (String(property) === 'setPosition' && armedFailure !== undefined) {
          renderPositionCalls += 1;
          const error = armedFailure;
          armedFailure = undefined;
          throw error;
        }
        if (String(property) === 'setPosition' && renderPositionCalls > 0) {
          renderPositionCalls += 1;
        }
        return proxy;
      },
    });
    return proxy;
  };
  return {
    scene: { add: { bitmapText } },
    failNextPosition: (error) => { armedFailure = error; },
    renderPositionCalls: () => renderPositionCalls,
  };
}

function createShutdownDamageScene(): {
  readonly scene: object;
  readonly callsFor: (setter: string) => readonly (readonly unknown[])[];
  readonly clear: () => void;
  readonly destroyFontData: () => void;
  readonly restoreFontData: () => void;
} {
  const calls = new Map<string, unknown[][]>();
  let fontDataAvailable = true;
  const bitmapText = (): object => {
    const proxy = new Proxy({}, {
      get: (_target, property) => (...args: unknown[]) => {
        const setter = String(property);
        const recorded = calls.get(setter) ?? [];
        recorded.push(args);
        calls.set(setter, recorded);
        if (setter === 'setText' && !fontDataAvailable) {
          throw new TypeError("Cannot read properties of null (reading 'chars')");
        }
        return proxy;
      },
    });
    return proxy;
  };
  return {
    scene: { add: { bitmapText } },
    callsFor: (setter) => calls.get(setter) ?? [],
    clear: () => { calls.clear(); },
    destroyFontData: () => { fontDataAvailable = false; },
    restoreFontData: () => { fontDataAvailable = true; },
  };
}

function createActorScene(): { readonly add: Record<string, () => object>; readonly tweenAdd: ReturnType<typeof vi.fn> } {
  const object = (): object => {
    const proxy = new Proxy({}, {
      get: (_target, property) => property === 'anims'
        ? { stop: () => undefined }
        : (..._args: unknown[]) => proxy,
    });
    return proxy;
  };
  const tweenAdd = vi.fn();
  return { add: { sprite: object, container: object }, tweenAdd };
}
