import { expect, it } from 'vitest';
import { DogTraderRig, type DogTraderPartsPort } from '../../src/game/enemies/DogTraderRig';
import { DogTraderRigTelemetry } from '../../src/game/enemies/DogTraderRigTelemetry';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';

it('실제 active rig와 두 part 공유 feedback/release만 read-only copy로 노출한다', () => {
  const telemetry = new DogTraderRigTelemetry();
  const rig = new DogTraderRig(noopParts(), telemetry);
  rig.render(dogTraderSnapshot(), 0);
  rig.flash(90);
  rig.recoil({
    direction: { x: -1, y: 0 },
    distancePx: 5,
    popScale: 1.08,
    durationMs: 90,
  });

  const first = telemetry.snapshot();
  expect(first).toMatchObject({
    active: { pathId: 'P1', parts: 2, gameplayEntityCount: 1 },
    lastSharedFeedbackParts: 2,
    lastReleaseParts: 0,
  });
  (first.active!.human as { x: number }).x = 9999;
  expect(telemetry.snapshot().active!.human.x).not.toBe(9999);
  expect('rig' in first).toBe(false);
  expect('parts' in first).toBe(false);

  rig.beginDeath(160);
  rig.reset();
  expect(telemetry.snapshot()).toMatchObject({
    active: null,
    lastSharedFeedbackParts: 2,
    lastReleaseParts: 2,
  });

  telemetry.reset();
  expect(telemetry.snapshot()).toEqual({
    active: null,
    lastSharedFeedbackParts: 0,
    lastReleaseParts: 0,
  });
});

function noopParts(): DogTraderPartsPort {
  return {
    renderHuman: () => undefined,
    renderTruck: () => undefined,
    flashHuman: () => undefined,
    flashTruck: () => undefined,
    recoilHuman: () => undefined,
    recoilTruck: () => undefined,
    beginHumanDeath: () => undefined,
    beginTruckDeath: () => undefined,
    resetHuman: () => undefined,
    resetTruck: () => undefined,
  };
}

function dogTraderSnapshot(): EnemySnapshot {
  return {
    id: 7,
    kind: 'dogTrader',
    variant: 'male',
    state: 'moving',
    pathId: 'P1',
    pathProgress: 40,
    position: { x: 0, y: 0 },
    etaMs: 0,
    currentHp: 900,
    maxHp: 900,
    spawnSequence: 0,
    isBoss: true,
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
    dashCooldownRemainingMs: 0,
    animationElapsedMs: 0,
  };
}
