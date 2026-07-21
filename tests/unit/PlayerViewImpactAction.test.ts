import { expect, it, vi } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import { PlayerView } from '../../src/game/player/PlayerView';
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
    scene: { add: { sprite: () => recorded } },
    last: (method) => calls.get(method)?.at(-1),
  };
}
