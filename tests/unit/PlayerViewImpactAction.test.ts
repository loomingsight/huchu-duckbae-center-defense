import { expect, it, vi } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  PlayerView,
  TAIL_SWIPE_BODY_DURATION_MS,
  TAIL_SWIPE_LAST_FRAME_HOLD_MS,
  TAIL_SWIPE_SWEEP_MS,
  tailSweepTransformAt,
} from '../../src/game/player/PlayerView';
import * as PlayerViewModule from '../../src/game/player/PlayerView';
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
    bodyAction: { kind: 'tailSwipe', elapsedMs: 125 },
  });
  expect(fake.spriteCount()).toBe(2);
  expect(fake.last('setTexture')).toEqual([AssetKeys.huchuTailSwipe]);
  expect(fake.last('setFrame')).toEqual([3]);
  expect(fake.spriteLast(1, 'setTexture')).toEqual(['huchu-tail-overlay']);
  expect(fake.spriteLast(1, 'setFrame')).toEqual([3]);
  expect(fake.spriteLast(1, 'setVisible')).toEqual([true]);
  const bodyScale = fake.last('setScale')?.[0];
  const tailScale = fake.spriteLast(1, 'setScale')?.[0];
  expect(bodyScale).toBeTypeOf('number');
  expect(tailScale).toBeTypeOf('number');
  expect(tailScale as number).toBeCloseTo((bodyScale as number) * 2, 9);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'aquaBeam', elapsedMs: 250 },
  });
  expect(fake.last('setTexture')).toEqual([AssetKeys.huchuAttack]);
  expect(fake.last('setFrame')).toEqual([3]);
  expect(fake.spriteLast(1, 'setVisible')).toEqual([false]);
});

it('꼬리치기는 125ms 타격 뒤 마지막 프레임을 400ms 유지해 총 525ms 재생한다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);

  expect(TAIL_SWIPE_SWEEP_MS).toBe(125);
  expect(TAIL_SWIPE_LAST_FRAME_HOLD_MS).toBe(400);
  expect(TAIL_SWIPE_BODY_DURATION_MS).toBeCloseTo(3 * 1000 / 24 + 400, 9);
  expect(TAIL_SWIPE_BODY_DURATION_MS).toBe(525);

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
  expect(fake.spriteLast(1, 'setFrame')).toEqual([3]);

  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: TAIL_SWIPE_BODY_DURATION_MS - 0.001 },
  });
  expect(fake.spriteLast(1, 'setFrame')).toEqual([3]);
});

it('꼬리 오버레이는 후추의 좌우 방향을 함께 따른다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);

  view.attackOrigin({ x: 270, y: 650 }, { x: 170, y: 650 });
  view.render({
    x: 270,
    y: 650,
    worldAnimationMs: 0,
    moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: 125 },
  });

  expect(fake.last('setFlipX')).toEqual([true]);
  expect(fake.spriteLast(1, 'setFlipX')).toEqual([true]);
  expect(fake.spriteLast(1, 'setOrigin')).toEqual([54 / 256, 150 / 256]);
});

it('꼬리 오버레이 뿌리는 후추 엉덩이 좌표를 좌우 대칭으로 따른다', () => {
  const tailOverlayRoot = (PlayerViewModule as unknown as {
    readonly tailOverlayRoot?: (
      position: { readonly x: number; readonly y: number },
      facingLeft: boolean,
    ) => { readonly x: number; readonly y: number };
  }).tailOverlayRoot;

  expect(tailOverlayRoot).toBeTypeOf('function');
  if (tailOverlayRoot === undefined) return;
  expect(tailOverlayRoot({ x: 270, y: 650 }, false)).toEqual({ x: 256, y: 605 });
  expect(tailOverlayRoot({ x: 270, y: 650 }, true)).toEqual({ x: 284, y: 605 });
});

it('말린 꼬리는 뿌리를 고정하고 바깥 sweep 뒤 안쪽으로 감기는 갈고리를 좌우 대칭으로 보간한다', () => {
  expect(tailSweepTransformAt(0, false)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: 180,
  });
  expect(tailSweepTransformAt(62.5, false)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: 90,
  });
  expect(tailSweepTransformAt(105, false)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: -24,
  });
  expect(tailSweepTransformAt(125, false)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: 18,
  });
  expect(tailSweepTransformAt(62.5, true)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: -90,
  });
  expect(tailSweepTransformAt(105, true)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: 24,
  });
  expect(tailSweepTransformAt(525, true)).toEqual({
    rootOffset: { x: 0, y: 0 }, rotationDeg: -18,
  });
});

it('PlayerView는 갈고리 각도를 꼬리 sprite에 적용하고 125ms 뒤 마지막 자세를 유지한다', () => {
  const fake = createScene();
  const view = new PlayerView(fake.scene as never, { x: 270, y: 650 }, {} as never);

  view.render({
    x: 270, y: 650, worldAnimationMs: 0, moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: 62.5 },
  });
  expect(fake.spriteLast(1, 'setAngle')).toEqual([90]);
  expect(fake.spriteLast(1, 'setPosition')).toEqual([256, 605]);

  view.render({
    x: 270, y: 650, worldAnimationMs: 0, moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: 500 },
  });
  expect(fake.spriteLast(1, 'setAngle')).toEqual([18]);
  expect(fake.spriteLast(1, 'setPosition')).toEqual([256, 605]);

  view.attackOrigin({ x: 270, y: 650 }, { x: 170, y: 650 });
  view.render({
    x: 270, y: 650, worldAnimationMs: 0, moving: false,
    bodyAction: { kind: 'tailSwipe', elapsedMs: 62.5 },
  });
  expect(fake.spriteLast(1, 'setAngle')).toEqual([-90]);
  expect(fake.spriteLast(1, 'setPosition')).toEqual([284, 605]);
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
  spriteLast(index: number, method: string): readonly unknown[] | undefined;
  spriteCount(): number;
} {
  const sprites: Array<{ readonly calls: Map<string, unknown[][]>; readonly proxy: object }> = [];
  const recorded = (): { readonly calls: Map<string, unknown[][]>; readonly proxy: object } => {
    const calls = new Map<string, unknown[][]>();
    const target = {};
    const proxy = new Proxy(target, {
      get: (_current, property) => (...args: unknown[]) => {
        const name = String(property);
        const history = calls.get(name) ?? [];
        history.push(args);
        calls.set(name, history);
        return proxy;
      },
    });
    return { calls, proxy };
  };
  const graphics = recorded();
  return {
    scene: {
      add: {
        sprite: () => {
          const sprite = recorded();
          sprites.push(sprite);
          return sprite.proxy;
        },
        graphics: () => graphics.proxy,
      },
    },
    last: (method) => sprites[0]?.calls.get(method)?.at(-1),
    spriteLast: (index, method) => sprites[index]?.calls.get(method)?.at(-1),
    spriteCount: () => sprites.length,
  };
}
