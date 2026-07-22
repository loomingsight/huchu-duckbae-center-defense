import { expect, it, vi } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  PlayerView,
  TAIL_SWIPE_BODY_DURATION_MS,
  TAIL_SWIPE_LAST_FRAME_HOLD_MS,
} from '../../src/game/player/PlayerView';
import { PresentationTelemetry } from '../../src/game/presentation/PresentationTelemetry';
import type { PoolSnapshot } from '../../src/game/pooling/ObjectPool';

it('tail body action은 전용 sheet를 쓰고 aqua body action은 attack sheet를 쓴다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: 250 },
  });
  expect(fake.last('setTexture')).toEqual([AssetKeys.huchuTailSwipe]);
  expect(fake.last('setFrame')).toEqual([3]);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'aquaBeam', elapsedMs: 250 },
  });
  expect(fake.last('setTexture')).toEqual([AssetKeys.huchuAttack]);
  expect(fake.last('setFrame')).toEqual([3]);
});

it('꼬리치기는 마지막 프레임을 정확히 800ms 유지한다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);

  expect(TAIL_SWIPE_LAST_FRAME_HOLD_MS).toBe(800);
  expect(TAIL_SWIPE_BODY_DURATION_MS).toBeCloseTo(5 * 1000 / 12 + 800, 9);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: {
      kind: 'tailSwipe',
      elapsedMs: TAIL_SWIPE_BODY_DURATION_MS - TAIL_SWIPE_LAST_FRAME_HOLD_MS,
    },
  });
  expect(fake.last('setFrame')).toEqual([5]);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: TAIL_SWIPE_BODY_DURATION_MS - 0.001 },
  });
  expect(fake.last('setFrame')).toEqual([5]);
});

it('공격 시각 효과는 좌우 대상에 맞춘 후추 입에서 시작한다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);
  const attackOrigin = (view as unknown as {
    attackOrigin?: (
      origin: { readonly x: number; readonly y: number },
      target: { readonly x: number; readonly y: number },
    ) => { readonly x: number; readonly y: number };
  }).attackOrigin;

  expect(attackOrigin).toBeTypeOf('function');
  if (attackOrigin === undefined) return;

  expect(attackOrigin.call(view, { x: 270, y: 650 }, { x: 370, y: 650 }))
    .toEqual({ x: 302, y: 605 });
  expect(fake.last('setFlipX')).toEqual([false]);

  expect(attackOrigin.call(view, { x: 270, y: 650 }, { x: 170, y: 650 }))
    .toEqual({ x: 238, y: 605 });
  expect(fake.last('setFlipX')).toEqual([true]);
});

it('shutdown은 shared effect pool을 telemetry에서 한 번만 reset한다', () => {
  const fake = createScene();
  const sharedEffects = {
    snapshot: () => poolSnapshot(),
    releaseAll: vi.fn(),
    releaseType: vi.fn(),
  };
  const view = new PlayerView(
    fake.scene as never,
    { x: 270, y: 650 },
    sharedEffects as never,
  );
  const telemetry = new PresentationTelemetry({
    enemies: {
      snapshot: () => poolSnapshot(),
      labelPoolSnapshot: () => poolSnapshot(),
      reset: vi.fn(),
    },
    projectiles: { snapshot: () => poolSnapshot(), reset: vi.fn() },
    effects: sharedEffects,
    damageNumbers: { snapshot: () => poolSnapshot(), reset: vi.fn() },
    listenerCount: () => 0,
  });

  telemetry.reset();
  view.destroy();

  expect(sharedEffects.releaseAll).toHaveBeenCalledTimes(1);
  expect(sharedEffects.releaseType).not.toHaveBeenCalled();

  view.resetCombatVisuals();
  expect(sharedEffects.releaseType).toHaveBeenCalledTimes(1);
});

function poolSnapshot(): PoolSnapshot {
  return { instanceId: 1, created: 1, active: 0, available: 1 };
}

function createScene(): {
  readonly scene: object;
  last(method: string): readonly unknown[] | undefined;
} {
  const calls = new Map<string, unknown[][]>();
  const target = {};
  const recorded = new Proxy(target, {
    get: (_current, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      return recorded;
    },
  });
  return {
    scene: { add: { sprite: () => recorded, graphics: () => recorded } },
    last: (method) => calls.get(method)?.at(-1),
  };
}
