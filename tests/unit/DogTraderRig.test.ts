import { describe, expect, it } from 'vitest';
import { animationFrameAt } from '../../src/game/assets/AnimationManifest';
import { resolveDogTraderAsset } from '../../src/game/assets/DogTraderDirectionalAssets';
import { TRADER_SIDE_BY_PATH } from '../../src/game/data/pathDefinitions';
import {
  DogTraderRig,
  type DogTraderPartsPort,
  type DogTraderTruckRenderInput,
} from '../../src/game/enemies/DogTraderRig';
import {
  DEFAULT_PATH_POSE_SAMPLERS,
} from '../../src/game/enemies/DogTraderAttackGeometry';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import type { EnemyState } from '../../src/game/types/GameTypes';
import type { Direction8 } from '../../src/game/world/DirectionalFrameResolver';
import type { Point } from '../../src/game/world/Geometry';

describe('DogTraderRig', () => {
  it('truck은 p-70/side28을 120ms damping하고 snap/reset/reuse 첫 frame은 즉시 맞춘다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);
    const firstEnemy = dogTraderSnapshot('P1', 100);

    rig.render(firstEnemy, 16);
    const first = visual.lastTruck;
    expect(first).toEqual(visual.lastTruckTarget);
    expect(rig.snapshot()).toMatchObject({
      pathId: 'P1',
      parts: 2,
      gameplayEntityCount: 1,
      followDistance: 70,
      lateralDistance: -28,
    });

    rig.render({ ...firstEnemy, pathProgress: 120 }, 120);
    expect(visual.lastTruck.x).toBeCloseTo(
      first.x + (visual.lastTruckTarget.x - first.x) * (1 - Math.exp(-1)),
      6,
    );
    expect(visual.lastTruck.y).toBeCloseTo(
      first.y + (visual.lastTruckTarget.y - first.y) * (1 - Math.exp(-1)),
      6,
    );

    rig.snapNextPose();
    rig.render({ ...firstEnemy, pathProgress: 140 }, 16);
    expect(visual.lastTruck).toEqual(visual.lastTruckTarget);

    rig.reset();
    rig.render({ ...firstEnemy, pathProgress: 160 }, 16);
    expect(visual.lastTruck).toEqual(visual.lastTruckTarget);
  });

  it('사람만 gameplay anchor이고 feedback/death/reset은 두 part에 정확히 한 번 적용된다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);
    rig.render(dogTraderSnapshot('P2', 180), 0);

    rig.flash(90);
    rig.recoil({
      direction: { x: -1, y: 0 },
      distancePx: 5,
      popScale: 1.08,
      durationMs: 90,
    });
    expect(rig.getFeedbackAnchor()).toEqual(rig.humanAnchor());
    expect(rig.getFeedbackAnchor()).not.toBe(rig.humanAnchor());
    rig.beginDeath(160);
    rig.beginDeath(160);
    rig.reset();

    expect(visual.calls).toEqual([
      'flash-human',
      'flash-truck',
      'recoil-human',
      'recoil-truck',
      'death-human',
      'death-truck',
      'reset-human',
      'reset-truck',
    ]);
  });

  it('pathProgress -70의 사람과 -140의 트럭은 P1~P6 진입 경계 밖에 있다', () => {
    for (const pathId of Object.keys(TRADER_SIDE_BY_PATH) as EnemySnapshot['pathId'][]) {
      const visual = new FakeDogTraderParts();
      const rig = new DogTraderRig(visual);
      rig.render(dogTraderSnapshot(pathId, -70), 0);
      const snapshot = rig.snapshot();
      expect(snapshot.human).toEqual(
        DEFAULT_PATH_POSE_SAMPLERS[pathId].sampleExtended(-70).position,
      );
      expect(isOutsideWorld(snapshot.human, 540, 960)).toBe(true);
      expect(isOutsideWorld(snapshot.truck, 540, 960)).toBe(true);
    }
  });

  it('사람은 이동 방향/공격 중 shelter를 보고 truck은 마지막 이동 heading과 wheel frame을 유지한다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);
    const moving = dogTraderSnapshot('P1', 120, {
      state: 'moving',
      animationElapsedMs: 310,
    });
    rig.render(moving, 16);
    const movingTruck = { ...visual.lastTruck };
    const movingTruckDirection = visual.lastTruckRender.direction;
    const movingWheelFrame = visual.lastTruckRender.frame;

    rig.render({
      ...moving,
      state: 'windup',
      pathProgress: 170,
      animationElapsedMs: 0,
    }, 16);
    expect(visual.lastHumanRender.direction).toBe(shelterDirectionFor('P1', 170));
    expect(visual.lastTruck).toEqual(movingTruck);
    expect(visual.lastTruckRender.direction).toBe(movingTruckDirection);
    expect(visual.lastTruckRender.frame).toBe(movingWheelFrame);

    rig.render({
      ...moving,
      state: 'holding',
      pathProgress: 190,
      animationElapsedMs: 240,
    }, 16);
    expect(visual.lastTruck).toEqual(movingTruck);
    expect(visual.lastTruckRender.frame).toBe(movingWheelFrame);
    expect(Math.abs(visual.lastTruckRender.bodyIdleY)).toBeLessThanOrEqual(1);
  });

  it.each([
    { multiplier: 1, humanFrames: [0, 1, 2, 5, 4], truckFrames: [0, 1, 2, 1, 2] },
    { multiplier: 0.7, humanFrames: [0, 0, 1, 3, 1], truckFrames: [0, 0, 1, 3, 3] },
    { multiplier: 0.5, humanFrames: [0, 0, 1, 2, 5], truckFrames: [0, 0, 1, 2, 1] },
  ])(
    '이동 multiplier $multiplier는 human walk와 truck roll의 10fps frame을 함께 늦춘다',
    ({ multiplier, humanFrames, truckFrames }) => {
      const visual = new FakeDogTraderParts();
      const rig = new DogTraderRig(visual);

      [0, 100, 200, 500, 1_000].forEach((animationElapsedMs) => {
        rig.render(dogTraderSnapshot('P1', 120, {
          animationElapsedMs,
          moveSpeedMultiplier: multiplier,
        }), 16);
      });

      expect(visual.humanFrames).toEqual(humanFrames);
      expect(visual.truckFrames).toEqual(truckFrames);
      const snapshot = rig.snapshot();
      expect(visual.lastHumanRender.direction).toBe(snapshot.humanDirection);
      expect(visual.lastHumanRender.flipX).toBe(snapshot.humanFlipX);
      expect(visual.lastTruckRender.direction).toBe(snapshot.truckDirection);
      expect(visual.lastTruckRender.flipX).toBe(snapshot.truckFlipX);
    },
  );

  it.each([1, 0.7, 0.5])(
    '이동 multiplier %s에서도 attack은 raw 10fps cadence와 event frame/socket을 유지한다',
    (multiplier) => {
      const visual = new FakeDogTraderParts();
      const rig = new DogTraderRig(visual);
      const moving = dogTraderSnapshot('P1', 120, {
        animationElapsedMs: 500,
        moveSpeedMultiplier: multiplier,
      });
      rig.render(moving, 16);
      const movingWheelFrame = visual.lastTruckRender.frame;

      rig.render({
        ...moving,
        state: 'windup',
        animationElapsedMs: 500,
      }, 16);

      const attack = resolveDogTraderAsset('attack', visual.lastHumanRender.direction);
      expect(visual.lastHumanRender).toMatchObject({
        state: 'windup',
        elapsedMs: 500,
        frame: 5,
        flipX: attack.flipX,
        eventFrame: 5,
        eventKind: 'projectileRelease',
        eventSocket: attack.eventSocket,
      });
      expect(visual.lastTruckRender).toMatchObject({
        rolling: false,
        frame: movingWheelFrame,
      });
    },
  );

  it.each([
    {
      multiplier: 0.7,
      effectiveElapsed: [500, 500, 570, 640, 640, 740],
      humanFrames: [5, 5, 5, 0, 0, 1],
      truckFrames: [1, 1, 1, 2, 2, 3],
    },
    {
      multiplier: 0.5,
      effectiveElapsed: [500, 500, 550, 600, 600, 700],
      humanFrames: [5, 5, 5, 0, 0, 1],
      truckFrames: [1, 1, 1, 2, 2, 3],
    },
  ])(
    '이동 중 1→$multiplier→1 전환은 human/truck phase를 역행하거나 raw clock으로 점프하지 않는다',
    ({ multiplier, effectiveElapsed, humanFrames, truckFrames }) => {
      const visual = new FakeDogTraderParts();
      const rig = new DogTraderRig(visual);
      const renders = [
        { animationElapsedMs: 500, moveSpeedMultiplier: 1, slowRemainingMs: 0 },
        { animationElapsedMs: 500, moveSpeedMultiplier: multiplier, slowRemainingMs: 2_000 },
        { animationElapsedMs: 600, moveSpeedMultiplier: multiplier, slowRemainingMs: 1_900 },
        { animationElapsedMs: 700, moveSpeedMultiplier: multiplier, slowRemainingMs: 1_800 },
        { animationElapsedMs: 700, moveSpeedMultiplier: 1, slowRemainingMs: 0 },
        { animationElapsedMs: 800, moveSpeedMultiplier: 1, slowRemainingMs: 0 },
      ];

      renders.forEach((overrides) => {
        rig.render(dogTraderSnapshot('P1', 120, overrides), 16);
      });

      expect(visual.humanElapsedHistory).toEqual(effectiveElapsed);
      expect(visual.truckElapsedHistory).toEqual(effectiveElapsed);
      expect(visual.humanFrames).toEqual(humanFrames);
      expect(visual.truckFrames).toEqual(truckFrames);
    },
  );

  it.each([0.7, 0.5])(
    'multiplier %s 진입 뒤 deltaMs=0 resync도 누적 movement phase를 역행시키지 않는다',
    (multiplier) => {
      const visual = new FakeDogTraderParts();
      const rig = new DogTraderRig(visual);

      rig.render(dogTraderSnapshot('P1', 120, {
        animationElapsedMs: 500,
        moveSpeedMultiplier: 1,
        slowRemainingMs: 0,
      }), 16);
      rig.render(dogTraderSnapshot('P1', 120, {
        animationElapsedMs: 500,
        moveSpeedMultiplier: multiplier,
        slowRemainingMs: 2_000,
      }), 16);
      rig.render(dogTraderSnapshot('P1', 120, {
        animationElapsedMs: 600,
        moveSpeedMultiplier: multiplier,
        slowRemainingMs: 1_900,
      }), 0);

      expect(visual.humanElapsedHistory).toEqual([500, 500, 500 + 100 * multiplier]);
      expect(visual.truckElapsedHistory).toEqual([500, 500, 500 + 100 * multiplier]);
    },
  );

  it('render 사이 slow 만료는 남은 slow 구간과 정상 구간을 나눠 movement clock에 누적한다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);

    rig.render(dogTraderSnapshot('P1', 120, {
      animationElapsedMs: 500,
      moveSpeedMultiplier: 0.5,
      slowRemainingMs: 50,
    }), 16);
    rig.render(dogTraderSnapshot('P1', 120, {
      animationElapsedMs: 600,
      moveSpeedMultiplier: 1,
      slowRemainingMs: 0,
    }), 16);

    expect(visual.humanElapsedHistory).toEqual([250, 325]);
    expect(visual.truckElapsedHistory).toEqual([250, 325]);
    expect(visual.humanFrames).toEqual([2, 3]);
    expect(visual.truckFrames).toEqual([2, 3]);
  });

  it('raw clock 감소·pause resync·새 bind·reset 경계는 movement clock을 명시적으로 다시 맞춘다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);
    const renderMoving = (
      id: number,
      animationElapsedMs: number,
      moveSpeedMultiplier: number,
      deltaMs: number,
    ): void => {
      rig.render(dogTraderSnapshot('P1', 120, {
        id,
        animationElapsedMs,
        moveSpeedMultiplier,
        slowRemainingMs: moveSpeedMultiplier < 1 ? 1_000 : 0,
      }), deltaMs);
    };

    renderMoving(41, 500, 0.5, 16);
    renderMoving(41, 600, 0.5, 16);
    renderMoving(41, 0, 0.5, 16);
    renderMoving(41, 100, 0.5, 16);
    renderMoving(41, 300, 0.5, 0);
    renderMoving(41, 300, 0.5, 0);
    renderMoving(99, 400, 0.5, 16);
    rig.reset();
    renderMoving(99, 300, 0.7, 16);

    expect(visual.humanElapsedHistory).toEqual([250, 300, 0, 50, 150, 150, 200, 210]);
    expect(visual.truckElapsedHistory).toEqual([250, 300, 0, 50, 150, 150, 200, 210]);
  });

  it('slow 중 pause는 frame을 고정하고 death는 마지막 frame, reset은 초기 frame으로 복귀한다', () => {
    const visual = new FakeDogTraderParts();
    const rig = new DogTraderRig(visual);
    const moving = dogTraderSnapshot('P2', 180, {
      animationElapsedMs: 500,
      moveSpeedMultiplier: 0.5,
    });
    rig.render(moving, 16);
    expect(visual.lastHumanRender.frame).toBe(2);
    expect(visual.lastTruckRender.frame).toBe(2);

    rig.render(moving, 0);
    expect(visual.lastHumanRender.frame).toBe(2);
    expect(visual.lastTruckRender.frame).toBe(2);

    rig.render({ ...moving, state: 'dead', animationElapsedMs: 900 }, 0);
    expect(visual.lastHumanRender.frame).toBe(7);
    expect(visual.lastTruckRender.frame).toBe(2);

    rig.reset();
    rig.render({ ...moving, animationElapsedMs: 0 }, 0);
    expect(visual.lastHumanRender.frame).toBe(0);
    expect(visual.lastTruckRender.frame).toBe(0);
  });
});

class FakeDogTraderParts implements DogTraderPartsPort {
  readonly calls: string[] = [];
  lastHuman: Point = { x: 0, y: 0 };
  lastTruck: Point = { x: 0, y: 0 };
  lastTruckTarget: Point = { x: 0, y: 0 };
  readonly humanFrames: number[] = [];
  readonly truckFrames: number[] = [];
  readonly humanElapsedHistory: number[] = [];
  readonly truckElapsedHistory: number[] = [];
  lastHumanRender: {
    direction: Direction8;
    state: EnemyState;
    elapsedMs: number;
    frame: number;
    flipX: boolean;
    eventFrame?: number;
    eventKind?: string;
    eventSocket?: Point;
  } = {
    direction: 'south',
    state: 'moving',
    elapsedMs: 0,
    frame: 0,
    flipX: false,
  };
  lastTruckRender: {
    direction: Direction8;
    elapsedMs: number;
    rolling: boolean;
    frame: number;
    flipX: boolean;
    bodyIdleY: number;
  } = {
    direction: 'south',
    elapsedMs: 0,
    rolling: false,
    frame: 0,
    flipX: false,
    bodyIdleY: 0,
  };
  private wheelFrame = 0;

  renderHuman(
    position: Point,
    direction: Direction8,
    state: EnemyState,
    elapsedMs: number,
  ): void {
    const action = state === 'moving' ? 'walk' : 'attack';
    const resolved = resolveDogTraderAsset(action, direction);
    const frame = state === 'dead'
      ? resolved.entry.frameCount - 1
      : animationFrameAt(resolved.entry, elapsedMs);
    this.lastHuman = { ...position };
    this.humanElapsedHistory.push(elapsedMs);
    this.humanFrames.push(frame);
    this.lastHumanRender = {
      direction,
      state,
      elapsedMs,
      frame,
      flipX: resolved.flipX,
      eventFrame: resolved.entry.eventFrame,
      eventKind: resolved.entry.eventKind,
      eventSocket: resolved.eventSocket === undefined ? undefined : { ...resolved.eventSocket },
    };
  }

  renderTruck(
    position: Point,
    direction: Direction8,
    input: DogTraderTruckRenderInput,
  ): void {
    this.lastTruck = { ...position };
    this.lastTruckTarget = { ...input.target };
    const resolved = resolveDogTraderAsset('truckRoll', direction);
    if (input.rolling) this.wheelFrame = animationFrameAt(resolved.entry, input.elapsedMs);
    this.truckElapsedHistory.push(input.elapsedMs);
    this.truckFrames.push(this.wheelFrame);
    this.lastTruckRender = {
      direction,
      elapsedMs: input.elapsedMs,
      rolling: input.rolling,
      frame: this.wheelFrame,
      flipX: resolved.flipX,
      bodyIdleY: input.rolling ? 0 : Math.sin(input.elapsedMs / 180),
    };
  }

  flashHuman(): void { this.calls.push('flash-human'); }
  flashTruck(): void { this.calls.push('flash-truck'); }
  recoilHuman(): void { this.calls.push('recoil-human'); }
  recoilTruck(): void { this.calls.push('recoil-truck'); }
  beginHumanDeath(): void { this.calls.push('death-human'); }
  beginTruckDeath(): void { this.calls.push('death-truck'); }
  resetHuman(): void { this.calls.push('reset-human'); }
  resetTruck(): void {
    this.wheelFrame = 0;
    this.calls.push('reset-truck');
  }
}

function dogTraderSnapshot(
  pathId: EnemySnapshot['pathId'],
  pathProgress: number,
  overrides: Partial<EnemySnapshot> = {},
): EnemySnapshot {
  const position = DEFAULT_PATH_POSE_SAMPLERS[pathId].sampleExtended(pathProgress).position;
  return {
    id: 41,
    kind: 'dogTrader',
    variant: 'male',
    state: 'moving',
    pathId,
    pathProgress,
    position,
    etaMs: 0,
    currentHp: 900,
    maxHp: 900,
    spawnSequence: 0,
    isBoss: true,
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
    dashCooldownRemainingMs: 0,
    animationElapsedMs: 0,
    ...overrides,
  };
}

function isOutsideWorld(point: Point, width: number, height: number): boolean {
  return point.x < 0 || point.x > width || point.y < 0 || point.y > height;
}

function shelterDirectionFor(pathId: EnemySnapshot['pathId'], progress: number): Direction8 {
  const point = DEFAULT_PATH_POSE_SAMPLERS[pathId].sampleExtended(progress).position;
  const angle = Math.atan2(480 - point.y, 270 - point.x);
  const directions: readonly Direction8[] = [
    'east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast',
  ];
  const index = Math.round(angle / (Math.PI / 4));
  return directions[(index + directions.length) % directions.length]!;
}
