import { expect, it, vi } from 'vitest';
import type { PoolSnapshot } from '../../src/game/pooling/ObjectPool';
import { PresentationTelemetry } from '../../src/game/presentation/PresentationTelemetry';

it('모든 producer snapshot과 listener count를 exact shape로 읽는다', () => {
  const fixture = producers();
  const telemetry = new PresentationTelemetry(fixture.options);

  expect(telemetry.snapshot()).toEqual({
    enemies: fixture.snapshots.enemies,
    labels: fixture.snapshots.labels,
    labelBindings: [],
    projectiles: fixture.snapshots.projectiles,
    effects: fixture.snapshots.effects,
    damageNumbers: fixture.snapshots.damageNumbers,
    listenerCount: 3,
  });
});

it('reset은 producer마다 정확히 한 번 호출하고 snapshot identity를 바꾸지 않는다', () => {
  const fixture = producers();
  const telemetry = new PresentationTelemetry(fixture.options);
  const before = telemetry.snapshot();

  telemetry.reset();

  expect(fixture.resets.enemies).toHaveBeenCalledTimes(1);
  expect(fixture.resets.projectiles).toHaveBeenCalledTimes(1);
  expect(fixture.resets.effects).toHaveBeenCalledTimes(1);
  expect(fixture.resets.damageNumbers).toHaveBeenCalledTimes(1);
  expect(telemetry.snapshot()).toEqual(before);
});

it('reset은 여러 producer가 실패해도 모두 시도하고 첫 오류 identity를 보존한다', () => {
  const fixture = producers();
  const firstError = new Error('enemy reset failed');
  const laterError = new Error('effect reset failed');
  fixture.resets.enemies.mockImplementation(() => { throw firstError; });
  fixture.resets.effects.mockImplementation(() => { throw laterError; });
  const telemetry = new PresentationTelemetry(fixture.options);

  let thrown: unknown;
  try {
    telemetry.reset();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(firstError);
  expect(fixture.resets.enemies).toHaveBeenCalledOnce();
  expect(fixture.resets.projectiles).toHaveBeenCalledOnce();
  expect(fixture.resets.effects).toHaveBeenCalledOnce();
  expect(fixture.resets.damageNumbers).toHaveBeenCalledOnce();
});

function producers(): {
  readonly snapshots: Record<'enemies' | 'labels' | 'projectiles' | 'effects' | 'damageNumbers', PoolSnapshot>;
  readonly resets: Record<'enemies' | 'projectiles' | 'effects' | 'damageNumbers', ReturnType<typeof vi.fn>>;
  readonly options: ConstructorParameters<typeof PresentationTelemetry>[0];
} {
  const snapshots = {
    enemies: snapshot(1, 60),
    labels: snapshot(2, 60),
    projectiles: snapshot(3, 80),
    effects: snapshot(4, 120),
    damageNumbers: snapshot(5, 64),
  };
  const resets = {
    enemies: vi.fn(),
    projectiles: vi.fn(),
    effects: vi.fn(),
    damageNumbers: vi.fn(),
  };
  return {
    snapshots,
    resets,
    options: {
      enemies: {
        snapshot: () => snapshots.enemies,
        labelPoolSnapshot: () => snapshots.labels,
        reset: resets.enemies,
      },
      projectiles: { snapshot: () => snapshots.projectiles, reset: resets.projectiles },
      effects: { snapshot: () => snapshots.effects, releaseAll: resets.effects },
      damageNumbers: { snapshot: () => snapshots.damageNumbers, reset: resets.damageNumbers },
      listenerCount: () => 3,
    },
  };
}

function snapshot(instanceId: number, created: number): PoolSnapshot {
  return { instanceId, created, active: 0, available: created };
}
