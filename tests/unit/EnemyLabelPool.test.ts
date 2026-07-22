import { expect, it } from 'vitest';
import {
  enemyLabelAtlasFrame,
  type EnemyLabelCombinedFrameData,
} from '../../src/game/assets/EnemyLabelAtlas';
import { BALANCE } from '../../src/game/data/balance';
import {
  NOOP_COMPOSITE_ENEMY_RIG_FACTORY,
  type CompositeEnemyRig,
} from '../../src/game/enemies/CompositeEnemyRig';
import { EnemyActorPool } from '../../src/game/enemies/EnemyActorPool';
import { EnemyLabelPool } from '../../src/game/enemies/EnemyLabelPool';
import { ImpactFeedbackSystem } from '../../src/game/combat/ImpactFeedbackSystem';
import { enemy } from './fixtures';

it('label 60개를 정확히 preallocate하고 reset 뒤 같은 pool identity로 전부 반환한다', () => {
  const scene = createFakeScene();
  const actors = new EnemyActorPool(scene as never);
  const initial = actors.labelPoolSnapshot();

  expect(initial).toMatchObject({ created: 60, active: 0, available: 60 });
  Array.from({ length: BALANCE.caps.enemies }, (_, id) => {
    expect(actors.acquire(enemy({ id }))).toBeDefined();
  });
  expect(actors.labelPoolSnapshot()).toEqual({ ...initial, active: 60, available: 0 });

  actors.releaseAll();

  expect(actors.labelPoolSnapshot()).toEqual(initial);
});

it('duplicate id는 actor와 label을 재할당하거나 이름을 다시 bind하지 않는다', () => {
  const scene = createFakeScene();
  const actors = new EnemyActorPool(scene as never);
  const first = actors.acquire(enemy({ id: 7, kind: 'poopGuardian' }));
  const before = actors.labelPoolSnapshot();

  const duplicate = actors.acquire(enemy({ id: 7, kind: 'illegalBreeder' }));

  expect(duplicate).toBe(first);
  expect(actors.labelPoolSnapshot()).toEqual(before);
  expect(scene.labelFrames).toContain(enemyLabelAtlasFrame('똥 방치러', 0));
  expect(scene.labelFrames).not.toContain(enemyLabelAtlasFrame('불법번식업자', 0));
  expect(scene.textCreates).toBe(0);
});

it('label acquisition 실패 시 먼저 얻은 actor를 atomic rollback한다', () => {
  const scene = createFakeScene();
  const labels = new EnemyLabelPool(scene as never);
  const heldLabel = labels.acquire();
  const actors = new EnemyActorPool(scene as never, { labelPool: labels });

  Array.from({ length: 59 }, (_, id) => actors.acquire(enemy({ id })));
  expect(actors.acquire(enemy({ id: 59 }))).toBeUndefined();
  expect(actors.snapshot()).toMatchObject({ created: 60, active: 59, available: 1 });
  expect(actors.activeCount).toBe(59);

  expect(heldLabel).toBeDefined();
  labels.release(heldLabel!);
});

it('label pool preallocation 실패는 생성 완료된 combined Image까지 원자 rollback한다', () => {
  const fake = createFailingLabelScene(2);

  expect(() => new EnemyLabelPool(fake.scene as never)).toThrow('image init failed');

  expect(fake.created).toBe(3);
  expect(fake.destroyed).toBe(3);
});

it('dogTrader만 composite pose snap과 feedback target을 위임한다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  actors.acquire(enemy({ id: 1, kind: 'dogTrader', isBoss: true }));
  actors.acquire(enemy({ id: 2, kind: 'poopGuardian' }));

  actors.snapCompositePoses();

  expect(rig.snapCalls).toBe(1);
  expect(actors.feedbackTarget(1)).toBe(rig);
  expect(actors.feedbackTarget(2)).not.toBe(rig);
});

it('composite rig에는 frame render delta를 전달한다', () => {
  const scene = createFakeScene();
  const deltas: number[] = [];
  const rig = createFakeRig();
  rig.render = (_snapshot, deltaMs) => { deltas.push(deltaMs); };
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });

  actors.render([enemy({ id: 1, kind: 'dogTrader', isBoss: true })], 16);

  expect(deltas).toEqual([16]);
});

it('active render된 label만 enemy id별 computed damageAnchor를 copy로 노출한다', () => {
  const scene = createFakeScene();
  const actors = new EnemyActorPool(scene as never);
  const snapshot = enemy({ id: 7, position: { x: 270, y: 500 } });
  const damageAnchor = (enemyId: number): { x: number; y: number } | undefined => (
    (actors as unknown as {
      damageAnchor?: (targetId: number) => { x: number; y: number } | undefined;
    }).damageAnchor?.(enemyId)
  );

  actors.acquire(snapshot);
  expect(damageAnchor(7)).toBeUndefined();

  actors.render([snapshot]);
  const first = damageAnchor(7);
  expect(first).toEqual({ x: 270, y: 383 });
  first!.x = -1;
  expect(damageAnchor(7)).toEqual({ x: 270, y: 383 });
  expect(damageAnchor(404)).toBeUndefined();

  actors.beginDeath(7);
  expect(damageAnchor(7)).toBeUndefined();
});

it('pool rendered-visible count는 각 label view의 실제 render state를 집계한다', () => {
  const scene = createFakeScene();
  const actors = new EnemyActorPool(scene as never);
  actors.render(Array.from({ length: 60 }, (_, id) => enemy({
    id,
    position: {
      x: 60 + (id % 6) * 84,
      y: 130 + Math.floor(id / 6) * 84,
    },
  })));
  const count = (actors as unknown as {
    renderedVisibleLabelCount?: (camera: object, viewport: {
      left: number; right: number; top: number; bottom: number;
    }) => number;
  }).renderedVisibleLabelCount?.(
    {},
    { left: 0, right: 540, top: 0, bottom: 960 },
  );

  expect(count).toBe(60);
});

it('lethal은 feedback lookup에서 즉시 제거하지만 actor/label은 정확히 160ms 뒤 반환한다', () => {
  const scene = createFakeScene();
  const actors = new EnemyActorPool(scene as never);
  const actor = actors.acquire(enemy({ id: 7 }))!;
  const actorPoolBefore = actors.snapshot();
  const labelPoolBefore = actors.labelPoolSnapshot();

  expect(actors.beginDeath(7)).toBe(true);
  expect(actors.feedbackTarget(7)).toBeUndefined();
  expect(actors.dyingCount).toBe(1);
  expect(actors.snapshot()).toEqual(actorPoolBefore);
  expect(actors.labelPoolSnapshot()).toEqual(labelPoolBefore);

  actors.step(159);
  expect(actors.snapshot()).toEqual(actorPoolBefore);
  actors.step(1);
  expect(actors.dyingCount).toBe(0);
  expect(actors.snapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.acquire(enemy({ id: 8 }))).toBe(actor);
});

it('composite lethal은 rig beginDeath를 중복하지 않고 wrapper 160ms clock으로 actor/label을 반환한다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  actors.acquire(enemy({ id: 11, kind: 'dogTrader', isBoss: true }));
  const feedback = new ImpactFeedbackSystem({
    enemyTarget: (targetId) => actors.feedbackTarget(targetId),
    playerTarget: createFakeRig(),
    removeLethalTarget: (targetId) => { actors.beginDeath(targetId, true); },
  });

  feedback.handle({
    type: 'damageApplied', castId: 'aqua:1', appliedAtStep: 1, targetId: 11,
    amount: 30, effectiveAmount: 30, position: { x: 230, y: 410 },
    impactDirection: { x: 1, y: 0 }, source: 'aquaBeam', strength: 'heavy', lethal: true,
  });

  expect(rig.deathCalls).toBe(1);
  expect(actors.feedbackTarget(11)).toBeUndefined();
  expect(actors.dyingCount).toBe(1);
  actors.step(160);
  expect(rig.deathCalls).toBe(1);
  expect(actors.dyingCount).toBe(0);
  expect(actors.snapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 0, available: 60 });
});

it('dogTrader를 반환한 actor는 일반 적 3종에 LIFO 재사용되어도 숨은 rig를 다시 reset하지 않는다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const regularKinds = ['poopGuardian', 'offLeashGuardian', 'illegalBreeder'] as const;
  let expectedRigResets = 0;

  regularKinds.forEach((kind, index) => {
    const dogTrader = enemy({
      id: index * 2,
      kind: 'dogTrader',
      isBoss: true,
    });
    const dogTraderActor = actors.acquire(dogTrader)!;
    dogTraderActor.render(dogTrader);
    expect(rig.visible).toBe(true);

    expect(actors.release(dogTrader.id)).toBe(true);
    expectedRigResets += 1;
    expect(rig.resetCalls).toBe(expectedRigResets);
    expect(rig.visible).toBe(false);

    const regular = enemy({ id: index * 2 + 1, kind });
    const reusedActor = actors.acquire(regular)!;
    expect(reusedActor).toBe(dogTraderActor);
    reusedActor.render(regular);
    expect(rig.visible).toBe(false);

    expect(actors.release(regular.id)).toBe(true);
    expect(rig.resetCalls).toBe(expectedRigResets);
  });
});

it('같은 active actor가 dogTrader에서 일반 적으로 rebound되면 rig를 즉시 한 번만 숨긴다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const dogTrader = enemy({ id: 3, kind: 'dogTrader', isBoss: true });
  const regular = enemy({ id: 3, kind: 'poopGuardian' });

  actors.render([dogTrader]);
  expect(rig.visible).toBe(true);

  actors.render([regular]);
  expect(rig.visible).toBe(false);
  expect(rig.resetCalls).toBe(1);
  expect(actors.feedbackTarget(regular.id)).not.toBe(rig);

  expect(actors.beginDeath(regular.id)).toBe(true);
  actors.step(160);
  expect(rig.deathCalls).toBe(0);
  expect(rig.resetCalls).toBe(1);
});

it('dogTrader rig reset 실패는 active flag를 보존해 일반 적 rebound에서 다시 숨긴다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const resetFailure = new Error('dog trader rig reset failed');
  let shouldFail = true;
  rig.reset = function reset() {
    this.resetCalls += 1;
    if (shouldFail) {
      shouldFail = false;
      throw resetFailure;
    }
    this.visible = false;
  };
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const dogTrader = enemy({ id: 3, kind: 'dogTrader', isBoss: true });
  const regular = enemy({ id: 3, kind: 'poopGuardian' });
  actors.render([dogTrader]);

  expect(() => actors.render([regular])).toThrow(resetFailure);
  expect(rig.visible).toBe(true);
  expect(actors.feedbackTarget(dogTrader.id)).toBe(rig);

  expect(() => actors.render([regular])).not.toThrow();
  expect(rig.resetCalls).toBe(2);
  expect(rig.visible).toBe(false);
  expect(actors.feedbackTarget(regular.id)).not.toBe(rig);
});

it('release 중 actor reset 실패는 actor와 label 소유권을 보존해 다음 release에서 회수한다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const resetFailure = new Error('dog trader release reset failed');
  let shouldFail = true;
  rig.reset = function reset() {
    this.resetCalls += 1;
    if (shouldFail) {
      shouldFail = false;
      throw resetFailure;
    }
    this.visible = false;
  };
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const dogTrader = enemy({ id: 7, kind: 'dogTrader', isBoss: true });
  actors.render([dogTrader]);

  expect(() => actors.release(dogTrader.id)).toThrow(resetFailure);
  expect(actors.activeCount).toBe(1);
  expect(actors.snapshot()).toMatchObject({ active: 1, available: 59 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 1, available: 59 });

  expect(actors.release(dogTrader.id)).toBe(true);
  expect(actors.activeCount).toBe(0);
  expect(actors.snapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 0, available: 60 });
});

it('releaseAll은 한 actor reset 실패 뒤에도 나머지 actor를 회수하고 첫 오류를 보존한다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const resetFailure = new Error('first releaseAll reset failed');
  let shouldFail = true;
  rig.reset = function reset() {
    this.resetCalls += 1;
    if (shouldFail) {
      shouldFail = false;
      throw resetFailure;
    }
    this.visible = false;
  };
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  actors.render([
    enemy({ id: 1, kind: 'dogTrader', isBoss: true }),
    enemy({ id: 2, kind: 'poopGuardian' }),
  ]);

  expect(() => actors.releaseAll()).toThrow(resetFailure);
  expect(actors.activeCount).toBe(1);
  expect(actors.snapshot()).toMatchObject({ active: 1, available: 59 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 1, available: 59 });

  expect(() => actors.releaseAll()).not.toThrow();
  expect(actors.activeCount).toBe(0);
  expect(actors.snapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 0, available: 60 });
});

it('dying actor release 실패는 dying 소유권을 보존해 다음 step에서 회수한다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const resetFailure = new Error('dying dog trader reset failed');
  let shouldFail = true;
  rig.reset = function reset() {
    this.resetCalls += 1;
    if (shouldFail) {
      shouldFail = false;
      throw resetFailure;
    }
    this.visible = false;
  };
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const dogTrader = enemy({ id: 11, kind: 'dogTrader', isBoss: true });
  actors.render([dogTrader]);
  actors.beginDeath(dogTrader.id);

  expect(() => actors.step(160)).toThrow(resetFailure);
  expect(actors.dyingCount).toBe(1);
  expect(actors.snapshot()).toMatchObject({ active: 1, available: 59 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 1, available: 59 });

  expect(() => actors.step(0)).not.toThrow();
  expect(actors.dyingCount).toBe(0);
  expect(actors.snapshot()).toMatchObject({ active: 0, available: 60 });
  expect(actors.labelPoolSnapshot()).toMatchObject({ active: 0, available: 60 });
});

it('dogTrader lethal 뒤 일반 적 3종으로 LIFO 재사용하면 숨은 rig death/reset을 중복하지 않는다', () => {
  const scene = createFakeScene();
  const rig = createFakeRig();
  const actors = new EnemyActorPool(scene as never, { compositeRigFactory: () => rig });
  const regularKinds = ['poopGuardian', 'offLeashGuardian', 'illegalBreeder'] as const;

  regularKinds.forEach((kind, index) => {
    const dogTrader = enemy({
      id: index * 2,
      kind: 'dogTrader',
      isBoss: true,
    });
    const dogTraderActor = actors.acquire(dogTrader)!;
    dogTraderActor.render(dogTrader);
    expect(actors.beginDeath(dogTrader.id)).toBe(true);
    expect(rig.deathCalls).toBe(index + 1);
    actors.step(160);
    expect(rig.resetCalls).toBe(index + 1);
    expect(rig.visible).toBe(false);

    const regular = enemy({ id: index * 2 + 1, kind });
    const reusedActor = actors.acquire(regular)!;
    expect(reusedActor).toBe(dogTraderActor);
    reusedActor.render(regular);
    expect(actors.feedbackTarget(regular.id)).not.toBe(rig);

    expect(actors.beginDeath(regular.id)).toBe(true);
    actors.step(160);
    expect(rig.deathCalls).toBe(index + 1);
    expect(rig.resetCalls).toBe(index + 1);
    expect(rig.visible).toBe(false);
  });
});

it('후속 boss 구현이 없어도 주입 가능한 no-op composite factory를 제공한다', () => {
  const rig = NOOP_COMPOSITE_ENEMY_RIG_FACTORY(createFakeScene() as never);
  const snapshot = enemy({ kind: 'dogTrader', position: { x: 230, y: 410 } });

  rig.render(snapshot, 16);

  expect(rig.humanAnchor()).toEqual(snapshot.position);
  expect(rig.getFeedbackAnchor()).toEqual(snapshot.position);
});

function createFakeRig(): CompositeEnemyRig & {
  snapCalls: number;
  deathCalls: number;
  resetCalls: number;
  visible: boolean;
} {
  return {
    snapCalls: 0,
    deathCalls: 0,
    resetCalls: 0,
    visible: false,
    render() { this.visible = true; },
    humanAnchor: () => ({ x: 0, y: 0 }),
    snapNextPose() { this.snapCalls += 1; },
    reset() {
      this.resetCalls += 1;
      this.visible = false;
    },
    getFeedbackAnchor: () => ({ x: 0, y: 0 }),
    flash: () => undefined,
    recoil: () => undefined,
    beginDeath() { this.deathCalls += 1; },
  };
}

function createFakeScene(): {
  readonly labelFrames: string[];
  readonly textCreates: number;
  readonly add: {
    readonly sprite: () => object;
    readonly image: () => object;
    readonly container: () => object;
    readonly text: () => object;
  };
} {
  const labelFrames: string[] = [];
  let textCreates = 0;
  const object = (): object => {
    const state: {
      active: boolean;
      visible: boolean;
      alpha: number;
      width: number;
      height: number;
      frame: { name: string; width: number; height: number; customData: EnemyLabelCombinedFrameData } | null;
    } = { active: false, visible: false, alpha: 1, width: 1, height: 1, frame: null };
    const target = {};
    const proxy = new Proxy(target, {
      get: (_current, property) => {
        if (property === 'anims') return { stop: () => undefined };
        if (property === 'active') return state.active;
        if (property === 'visible') return state.visible;
        if (property === 'alpha') return state.alpha;
        if (property === 'width') return state.width;
        if (property === 'height') return state.height;
        if (property === 'frame') return state.frame;
        if (property === 'willRender') {
          return () => state.active && state.visible && state.alpha > 0;
        }
        return (...args: unknown[]) => {
          if (property === 'setFrame' && typeof args[0] === 'string') {
            labelFrames.push(args[0]);
            state.frame = createLabelFrame(String(args[0]));
            state.width = state.frame.width;
            state.height = state.frame.height;
          }
          if (property === 'setActive') state.active = Boolean(args[0]);
          if (property === 'setVisible') state.visible = Boolean(args[0]);
          if (property === 'setAlpha') state.alpha = Number(args[0]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  return {
    labelFrames,
    get textCreates() { return textCreates; },
    add: {
      sprite: object,
      image: object,
      container: object,
      text: () => {
        textCreates += 1;
        return object();
      },
    },
  };
}

function createLabelFrame(frameName: string): {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly customData: EnemyLabelCombinedFrameData;
} {
  const separator = frameName.lastIndexOf('::hp-');
  const displayName = frameName.slice(0, separator) as EnemyLabelCombinedFrameData['displayName'];
  const hpStep = Number(frameName.slice(separator + 5));
  const nameWidth = displayName.length * 14 + 6;
  const nameHeight = 17;
  const combinedWidth = Math.max(nameWidth, 30);
  const nameOffsetY = 14 - nameHeight / 2;
  const combinedHeight = Math.ceil(nameOffsetY + nameHeight);
  return {
    name: frameName,
    width: combinedWidth,
    height: combinedHeight,
    customData: {
      displayName,
      hpStep,
      nameWidth,
      nameHeight,
      combinedWidth,
      combinedHeight,
      nameOffsetX: (combinedWidth - nameWidth) / 2,
      nameOffsetY,
      hpOffsetX: (combinedWidth - 30) / 2,
      hpOffsetY: 0,
    },
  };
}

function createFailingLabelScene(failAt: number): {
  readonly scene: object;
  readonly created: number;
  readonly destroyed: number;
} {
  let created = 0;
  let destroyed = 0;
  const scene = {
    add: {
      image: () => {
        const index = created;
        created += 1;
        const target = {};
        const object = new Proxy(target, {
          get: (_current, property) => (..._args: unknown[]) => {
            if (property === 'setOrigin' && index === failAt) throw new Error('image init failed');
            if (property === 'destroy') destroyed += 1;
            return object;
          },
        });
        return object;
      },
    },
  };
  return {
    scene,
    get created() { return created; },
    get destroyed() { return destroyed; },
  };
}
