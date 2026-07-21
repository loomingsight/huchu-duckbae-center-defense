import { describe, expect, it } from 'vitest';
import { animationEntry } from '../../src/game/assets/AnimationManifest';
import {
  CompanionView,
  companionTargetPose,
  smoothCompanionPose,
} from '../../src/game/companions/CompanionView';
import { secondaryMotionAt } from '../../src/game/presentation/ActorMotion';

describe('Deokbae companion presentation', () => {
  it('target pose는 default north를 포함한 모든 facing에서 62px 뒤, 18px 왼쪽 계약을 지킨다', () => {
    const player = { x: 270, y: 650 };
    const facings = [
      { facing: { x: 0, y: -1 }, forward: { x: 0, y: -1 } },
      { facing: { x: 0, y: 0 }, forward: { x: 0, y: -1 } },
      { facing: { x: 1, y: 0 }, forward: { x: 1, y: 0 } },
      { facing: { x: 0, y: 1 }, forward: { x: 0, y: 1 } },
      { facing: { x: -1, y: 0 }, forward: { x: -1, y: 0 } },
      { facing: { x: 3, y: 4 }, forward: { x: 0.6, y: 0.8 } },
    ];

    for (const { facing, forward } of facings) {
      const target = companionTargetPose(player, facing);
      const delta = { x: target.x - player.x, y: target.y - player.y };
      const left = { x: forward.y, y: -forward.x };

      expect(delta.x * forward.x + delta.y * forward.y).toBeCloseTo(-62, 12);
      expect(delta.x * left.x + delta.y * left.y).toBeCloseTo(18, 12);
      expect(Math.hypot(delta.x, delta.y)).toBeCloseTo(Math.hypot(62, 18), 12);
    }

    expect(companionTargetPose({ x: 270, y: 650 }, { x: 1, y: 0 }))
      .toEqual({ x: 208, y: 632 });
    expect(companionTargetPose({ x: 270, y: 650 }, { x: 0, y: 0 }))
      .toEqual({ x: 252, y: 712 });
  });

  it('390px viewport의 default north pose는 52px dog 실루엣 겹침을 15% 이하로 제한한다', () => {
    const player = { x: 270, y: 650 };
    const target = companionTargetPose(player, { x: 0, y: -1 });
    const behindCssPx = (target.y - player.y) * (390 / 540);
    const overlapRatio = (52 - behindCssPx) / 52;

    expect(overlapRatio).toBeLessThanOrEqual(0.15);
  });

  it('100ms 지수 smoothing은 render delta partition과 무관하게 같은 pose로 수렴한다', () => {
    expect(smoothCompanionPose({ x: 0, y: 0 }, { x: 100, y: 0 }, 100).x)
      .toBeCloseTo(63.212, 3);

    const target = { x: 226, y: 632 };
    const finalAt = (fps: 30 | 60 | 120) => {
      let current = { x: 0, y: 0 };
      const deltaMs = 1000 / fps;
      for (let frame = 0; frame < fps; frame += 1) {
        current = smoothCompanionPose(current, target, deltaMs);
      }
      return current;
    };
    const poses = [finalAt(30), finalAt(60), finalAt(120)];

    expect(Math.max(...poses.map(({ x }) => x)) - Math.min(...poses.map(({ x }) => x)))
      .toBeLessThanOrEqual(1e-6);
    expect(Math.max(...poses.map(({ y }) => y)) - Math.min(...poses.map(({ y }) => y)))
      .toBeLessThanOrEqual(1e-6);
  });

  it('2Hz secondary motion은 reduced-motion에서 root가 아니라 body 진폭만 절반이다', () => {
    const full = secondaryMotionAt(50, false);
    const reduced = secondaryMotionAt(50, true);

    expect(full).toMatchObject({
      bobY: expect.any(Number),
      tiltRad: expect.any(Number),
      scaleY: expect.any(Number),
    });
    expect(Math.abs(reduced.bobY)).toBeCloseTo(Math.abs(full.bobY) / 2, 6);
    expect(Math.abs(reduced.tiltRad)).toBeCloseTo(Math.abs(full.tiltRad) / 2, 6);
    expect(1 - reduced.scaleY).toBeCloseTo((1 - full.scaleY) / 2, 6);
  });

  it('reset은 첫 render 전에 snap하고 body sprite만 움직이며 attack은 core event로 시작한다', () => {
    const fake = createFakeScene();
    const view = new CompanionView(fake.scene as never, {
      player: { x: 0, y: 0 },
      facing: { x: 0, y: -1 },
    });
    const root = fake.containers[0]!;
    const body = fake.sprites[0]!;

    view.reset({ player: { x: 270, y: 650 }, facing: { x: 0, y: -1 } });
    expect(view.snapshot().position).toEqual({ x: 252, y: 712 });
    expect(lastCall(root, 'setPosition')).toEqual([252, 712]);
    expect(lastCall(root, 'setDepth')).toEqual([712]);

    view.render({
      companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 750 },
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
      moving: false,
      worldAnimationMs: 0,
      renderDeltaMs: 50,
      reducedMotion: false,
    });
    expect(lastCall(root, 'setPosition')).toEqual([252, 712]);
    expect(lastCall(body, 'setPosition')).toEqual([0, secondaryMotionAt(50, false).bobY]);
    expect(lastCall(body, 'setOrigin')).toEqual([0.5, 1]);

    view.startAttack('deokbae:1');
    view.stepSimulation(250);
    view.render({
      companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 500 },
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
      moving: false,
      worldAnimationMs: 0,
      renderDeltaMs: 50,
      reducedMotion: false,
    });
    expect(lastCall(body, 'setTexture')).toEqual(['deokbae-attack']);
    expect(lastCall(body, 'setFrame')).toEqual([
      animationEntry('deokbae-attack').eventFrame,
    ]);
  });

  it('120Hz render interleaving은 attack clock을 진행하지 않고 fixed simulation step만 진행한다', () => {
    const fake = createFakeScene();
    const view = new CompanionView(fake.scene as never, {
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
    });
    view.startAttack('deokbae:120hz');

    for (let frame = 0; frame < 120; frame += 1) {
      view.render(companionRenderSnapshot(1000 / 120));
    }

    expect(view.snapshot()).toMatchObject({
      attackCastId: 'deokbae:120hz',
      attackElapsedMs: 0,
    });
    expect(lastCall(fake.sprites[0]!, 'setFrame')).toEqual([0]);

    view.stepSimulation(1000 / 60);
    view.render(companionRenderSnapshot(1000 / 120));
    expect(view.snapshot().attackElapsedMs).toBeCloseTo(1000 / 60, 12);
  });

  it('500ms render hitch는 attack을 건너뛰지 않고 catch-up fixed steps만 impact frame에 도달시킨다', () => {
    const fake = createFakeScene();
    const view = new CompanionView(fake.scene as never, {
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
    });
    view.startAttack('deokbae:hitch');

    view.render(companionRenderSnapshot(500));
    expect(view.snapshot().attackElapsedMs).toBe(0);
    expect(lastCall(fake.sprites[0]!, 'setFrame')).toEqual([0]);

    for (let step = 0; step < 15; step += 1) view.stepSimulation(1000 / 60);
    view.render(companionRenderSnapshot(0));
    expect(view.snapshot().attackElapsedMs).toBeCloseTo(250, 12);
    expect(lastCall(fake.sprites[0]!, 'setFrame')).toEqual([3]);
  });

  it('matching impact만 event frame에 동기화하고 다른 cast impact는 no-op이다', () => {
    const view = new CompanionView(createFakeScene().scene as never, {
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
    });
    view.startAttack('deokbae:match');
    view.stepSimulation(100);

    view.syncAttackImpact('deokbae:other');
    expect(view.snapshot().attackElapsedMs).toBe(100);

    view.syncAttackImpact('deokbae:match');
    expect(view.snapshot().attackElapsedMs).toBe(250);
  });

  it('visibility/WebGL pose snap은 active cast clock을 보존하고 full reset만 지운다', () => {
    const fake = createFakeScene();
    const view = new CompanionView(fake.scene as never, {
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
    });
    view.startAttack('deokbae:resume');
    view.stepSimulation(125);

    view.snapPose({ player: { x: 400, y: 500 }, facing: { x: 1, y: 0 } });
    expect(view.snapshot()).toMatchObject({
      position: { x: 338, y: 482 },
      attackCastId: 'deokbae:resume',
      attackElapsedMs: 125,
    });

    view.reset({ player: { x: 270, y: 650 }, facing: { x: 0, y: -1 } });
    expect(view.snapshot()).toMatchObject({
      attacking: false,
      attackCastId: null,
      attackElapsedMs: null,
    });
  });

  it('dog manifest scale은 390px viewport에서 48~55px opaque height를 만들고 destroy는 idempotent하다', () => {
    const fake = createFakeScene();
    const view = new CompanionView(fake.scene as never, {
      player: { x: 270, y: 650 },
      facing: { x: 0, y: -1 },
    });
    const body = fake.sprites[0]!;
    const runtimeOpaqueHeight = animationEntry('deokbae-walk').opaqueHeightPx
      * view.snapshot().bodyScale
      * (390 / 540);

    expect(runtimeOpaqueHeight).toBeGreaterThanOrEqual(48);
    expect(runtimeOpaqueHeight).toBeLessThanOrEqual(55);
    body.listenerCount = 2;
    expect(() => {
      view.destroy();
      view.destroy();
    }).not.toThrow();
    expect(body.listenerCount).toBe(0);
    expect(lastCall(fake.containers[0]!, 'destroy')).toEqual([true]);
  });
});

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  listenerCount: number;
}

function createFakeScene(): {
  readonly scene: object;
  readonly sprites: FakeObject[];
  readonly containers: FakeObject[];
} {
  const sprites: FakeObject[] = [];
  const containers: FakeObject[] = [];
  return {
    scene: {
      add: {
        sprite: () => createFakeObject(sprites),
        container: () => createFakeObject(containers),
      },
    },
    sprites,
    containers,
  };
}

function createFakeObject(collection: FakeObject[]): object {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeObject = { object: {}, calls, listenerCount: 0 };
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      const history = calls.get(name) ?? [];
      history.push(args);
      calls.set(name, history);
      if (name === 'removeAllListeners') fake.listenerCount = 0;
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  collection.push(fake);
  return object;
}

function lastCall(object: FakeObject, name: string): unknown[] | undefined {
  return object.calls.get(name)?.at(-1);
}

function companionRenderSnapshot(renderDeltaMs: number) {
  return {
    companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 500 } as const,
    player: { x: 270, y: 650 },
    facing: { x: 0, y: -1 },
    moving: false,
    worldAnimationMs: 0,
    renderDeltaMs,
    reducedMotion: false,
  };
}
