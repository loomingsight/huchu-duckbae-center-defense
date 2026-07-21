import { AssetKeys } from '../../src/game/assets/AssetKeys';
import type { EnemyLabelCombinedFrameData } from '../../src/game/assets/EnemyLabelAtlas';
import {
  ENEMY_FRAME_HEIGHT,
  ENEMY_FRAME_WIDTH,
  enemyAttackFrameAt,
  enemyAnimation,
  enemyDisplayHeight,
  enemyFrameAt,
  enemyTextureKey,
  enemyWalkFrameAt,
  EnemyActor,
} from '../../src/game/enemies/EnemyActor';
import { EnemyActorPool } from '../../src/game/enemies/EnemyActorPool';
import type { CompositeEnemyRig } from '../../src/game/enemies/CompositeEnemyRig';
import {
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpColor,
  enemyHpRatio,
} from '../../src/game/enemies/EnemyHpBar';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import { existsSync, readFileSync } from 'node:fs';

it.each([
  [0.51, 0x39a852],
  [0.5, 0xf2ca45],
  [0.2, 0xf2ca45],
  [0.19, 0xd94b43],
] as const)(
  'HP ratio %f의 색은 %i다',
  (ratio, color) => expect(enemyHpColor(ratio)).toBe(color),
);

it('HP bar는 30x4이며 full HP도 1 ratio로 표시한다', () => {
  expect({ width: ENEMY_HP_BAR_WIDTH, height: ENEMY_HP_BAR_HEIGHT }).toEqual({
    width: 30,
    height: 4,
  });
  expect(enemyHpRatio(35, 35)).toBe(1);
  expect(enemyHpRatio(0, 35)).toBe(0);
});

it.each([
  [Number.NaN, 35],
  [1, Number.POSITIVE_INFINITY],
  [-1, 35],
  [36, 35],
  [1, 0],
] as const)('invalid HP current/max %s/%s를 fail-fast한다', (current, max) => {
  expect(() => enemyHpRatio(current, max)).toThrow(RangeError);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
  'invalid HP ratio %s를 fail-fast한다',
  (ratio) => expect(() => enemyHpColor(ratio)).toThrow(RangeError),
);

it('256x256 frame과 regular 84/boss 100 opaque 높이를 고정한다', () => {
  expect([ENEMY_FRAME_WIDTH, ENEMY_FRAME_HEIGHT]).toEqual([256, 256]);
  expect(enemyDisplayHeight('poopGuardian')).toBe(84);
  expect(enemyDisplayHeight('offLeashGuardian')).toBe(84);
  expect(enemyDisplayHeight('dogTrader')).toBe(100);
  expect(enemyDisplayHeight('illegalBreeder')).toBe(100);
});

it('적 kind·variant·action을 승인된 manifest texture key로 결정한다', () => {
  expect(enemyTextureKey('poopGuardian', 'male')).toBe(AssetKeys.poopMaleWalk);
  expect(enemyTextureKey('poopGuardian', 'female', 'attack')).toBe(AssetKeys.poopFemaleAttack);
  expect(enemyTextureKey('offLeashGuardian', 'male')).toBe(AssetKeys.offLeashMaleWalk);
  expect(enemyTextureKey('offLeashGuardian', 'female', 'attack')).toBe(AssetKeys.offLeashFemaleAttack);
  expect(enemyTextureKey('dogTrader', 'male')).toBe(AssetKeys.trader);
  expect(enemyTextureKey('dogTrader', 'female')).toBe(AssetKeys.trader);
  expect(enemyTextureKey('illegalBreeder', 'male')).toBe(AssetKeys.breederMaleWalk);
  expect(enemyTextureKey('illegalBreeder', 'female', 'attack')).toBe(AssetKeys.breederFemaleAttack);
});

it('walk 6-frame 10fps loop와 attack 8-frame 10fps one-shot을 pure resolver로 결정한다', () => {
  expect([0, 100, 200, 500, 600].map((ms) => enemyWalkFrameAt(ms))).toEqual([0, 1, 2, 5, 0]);
  expect([0, 100, 500, 700, 900].map((ms) => enemyAttackFrameAt(ms))).toEqual([0, 1, 5, 7, 7]);
  expect(enemyFrameAt('moving', 100)).toBe(1);
  expect(enemyFrameAt('windup', 500)).toBe(5);
  expect(enemyFrameAt('holding', 900)).toBe(7);
  expect(enemyFrameAt('dead', 0)).toBe(7);
});

it('presentation resolver의 unknown enum·invalid elapsed를 fail-fast한다', () => {
  expect(() => enemyDisplayHeight('unknown' as never)).toThrow(RangeError);
  expect(() => enemyTextureKey('poopGuardian', 'unknown' as never)).toThrow(RangeError);
  expect(() => enemyFrameAt('unknown' as never, 0)).toThrow(RangeError);
  expect(() => enemyFrameAt('moving', Number.NaN)).toThrow(RangeError);
});

it('EnemyActor는 feet origin/depth와 manifest scale을 그리고 reset에서 view 상태·listener를 초기화한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  sprite.listenerCount = 2;
  container.listenerCount = 2;

  actor.render({
    ...ENEMY_SNAPSHOT,
    kind: 'illegalBreeder',
    variant: 'female',
    state: 'holding',
    position: { x: 321, y: 654 },
    currentHp: 1000,
    maxHp: 1000,
    animationElapsedMs: 500,
  });

  expect(lastCall(sprite, 'setTexture')).toEqual([AssetKeys.breederFemaleAttack]);
  expect(lastCall(sprite, 'setFrame')).toEqual([5]);
  expect(lastCall(sprite, 'setOrigin')).toEqual([0.5, 1]);
  expect(lastCall(sprite, 'setScale')).toEqual([100 / 204, 100 / 204]);
  expect(lastCall(container, 'setPosition')).toEqual([321, 654]);
  expect(lastCall(container, 'setDepth')).toEqual([654]);

  actor.reset();

  expect(lastCall(sprite, 'setTexture')).toEqual([AssetKeys.poopMaleWalk]);
  expect(lastCall(sprite, 'setFrame')).toEqual([0]);
  expect(lastCall(sprite, 'setAlpha')).toEqual([1]);
  expect(lastCall(sprite, 'clearTint')).toEqual([]);
  expect(lastCall(sprite, 'anims.stop')).toEqual([]);
  expect(lastCall(sprite, 'setActive')).toEqual([false]);
  expect(lastCall(sprite, 'setVisible')).toEqual([false]);
  expect(lastCall(container, 'setPosition')).toEqual([0, 0]);
  expect(lastCall(container, 'setDepth')).toEqual([0]);
  expect(lastCall(container, 'setActive')).toEqual([false]);
  expect(lastCall(container, 'setVisible')).toEqual([false]);
  expect([sprite.listenerCount, container.listenerCount]).toEqual([0, 0]);
});

it('EnemyActor는 같은 texture/frame/origin/depth setter를 반복하지 않고 동적 transform은 유지한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  const first = {
    ...ENEMY_SNAPSHOT,
    position: { x: 10, y: 20 },
    animationElapsedMs: 20,
  };

  actor.render(first);
  const identityBefore = identitySetterCounts(sprite, container);
  const dynamicBefore = dynamicSetterCounts(sprite, container);

  actor.render({
    ...first,
    position: { x: 11, y: 20 },
    animationElapsedMs: 50,
  });

  expectSetterDelta(identityBefore, identitySetterCounts(sprite, container), {
    texture: 0,
    frame: 0,
    origin: 0,
    depth: 0,
  });
  expectSetterDelta(dynamicBefore, dynamicSetterCounts(sprite, container), {
    spritePosition: 1,
    rotation: 1,
    scale: 1,
    spriteActive: 0,
    spriteVisible: 0,
    containerPosition: 1,
    containerActive: 0,
    containerVisible: 0,
  });
});

it('EnemyActor idle feedback step은 tint나 container transform setter를 호출하지 않는다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites[0]!;
  const container = fake.containers[0]!;
  actor.render({ ...ENEMY_SNAPSHOT, position: { x: 10, y: 20 } });
  const before = {
    clearTint: lastCalls(sprite, 'clearTint').length,
    position: lastCalls(container, 'setPosition').length,
    scale: lastCalls(container, 'setScale').length,
  };

  actor.stepFeedback(1000 / 60);

  expect({
    clearTint: lastCalls(sprite, 'clearTint').length,
    position: lastCalls(container, 'setPosition').length,
    scale: lastCalls(container, 'setScale').length,
  }).toEqual(before);
});

it('EnemyActor는 같은 root 좌표를 다시 렌더할 때 container position setter를 생략한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const container = fake.containers[0]!;
  const snapshot = { ...ENEMY_SNAPSHOT, position: { x: 10, y: 20 } };
  actor.render(snapshot);
  const before = lastCalls(container, 'setPosition').length;

  actor.render({ ...snapshot, animationElapsedMs: 30 });

  expect(lastCalls(container, 'setPosition')).toHaveLength(before);
});

it('EnemyActor는 같은 texture의 frame 경계에서 setFrame만 한 번 호출한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  actor.render({ ...ENEMY_SNAPSHOT, position: { x: 10, y: 20 } });
  const before = identitySetterCounts(sprite, container);

  actor.render({
    ...ENEMY_SNAPSHOT,
    position: { x: 10, y: 20 },
    animationElapsedMs: 100,
  });

  expectSetterDelta(before, identitySetterCounts(sprite, container), {
    texture: 0,
    frame: 1,
    origin: 0,
    depth: 0,
  });
  expect(lastCall(sprite, 'setFrame')).toEqual([1]);
});

it('EnemyActor는 texture 변경 시 같은 frame 값도 texture와 함께 한 번 다시 적용한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  const position = { x: 10, y: 20 };
  actor.render({ ...ENEMY_SNAPSHOT, position });
  const before = identitySetterCounts(sprite, container);

  actor.render({
    ...ENEMY_SNAPSHOT,
    kind: 'illegalBreeder',
    position,
  });

  expectSetterDelta(before, identitySetterCounts(sprite, container), {
    texture: 1,
    frame: 1,
    origin: 0,
    depth: 0,
  });
  expect(lastCall(sprite, 'setTexture')).toEqual([AssetKeys.breederMaleWalk]);
  expect(lastCall(sprite, 'setFrame')).toEqual([0]);
});

it('EnemyActor는 y 변경 시 setDepth만 한 번 호출한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  actor.render({ ...ENEMY_SNAPSHOT, position: { x: 10, y: 20 } });
  const before = identitySetterCounts(sprite, container);

  actor.render({ ...ENEMY_SNAPSHOT, position: { x: 10, y: 21 } });

  expectSetterDelta(before, identitySetterCounts(sprite, container), {
    texture: 0,
    frame: 0,
    origin: 0,
    depth: 1,
  });
  expect(lastCall(container, 'setDepth')).toEqual([21]);
});

it('EnemyActor reset은 실제로 달라진 identity/depth만 복구하고 기본 상태 재사용은 반복하지 않는다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  actor.render({
    ...ENEMY_SNAPSHOT,
    state: 'holding',
    position: { x: 10, y: 20 },
    animationElapsedMs: 500,
  });
  const beforeReset = identitySetterCounts(sprite, container);

  actor.reset();

  expectSetterDelta(beforeReset, identitySetterCounts(sprite, container), {
    texture: 1,
    frame: 1,
    origin: 0,
    depth: 1,
  });
  const beforeReuse = identitySetterCounts(sprite, container);

  actor.render(ENEMY_SNAPSHOT);

  expectSetterDelta(beforeReuse, identitySetterCounts(sprite, container), {
    texture: 0,
    frame: 0,
    origin: 0,
    depth: 0,
  });
});

it('EnemyActor regular↔trader 전환은 composite lifecycle을 유지하며 texture/frame만 경계마다 적용한다', () => {
  const fake = createFakeScene();
  const rig = {
    render: vi.fn(),
    humanAnchor: vi.fn(() => ({ x: 10, y: 20 })),
    snapNextPose: vi.fn(),
    reset: vi.fn(),
    getFeedbackAnchor: vi.fn(() => ({ x: 10, y: 20 })),
    flash: vi.fn(),
    recoil: vi.fn(),
    beginDeath: vi.fn(),
  } satisfies CompositeEnemyRig;
  const actor = new EnemyActor(fake.scene as never, () => rig);
  const sprite = fake.sprites.at(0)!;
  const container = fake.containers.at(0)!;
  const regular = { ...ENEMY_SNAPSHOT, position: { x: 10, y: 20 } };
  const trader = { ...regular, kind: 'dogTrader' as const };
  actor.render(regular);
  const beforeTrader = identitySetterCounts(sprite, container);

  actor.render(trader, 16);

  expectSetterDelta(beforeTrader, identitySetterCounts(sprite, container), {
    texture: 1,
    frame: 1,
    origin: 0,
    depth: 0,
  });
  expect(lastCall(sprite, 'setActive')).toEqual([false]);
  expect(lastCall(sprite, 'setVisible')).toEqual([false]);
  expect(rig.render).toHaveBeenCalledTimes(1);
  const beforeRepeatedTrader = identitySetterCounts(sprite, container);

  actor.render(trader, 16);

  expectSetterDelta(beforeRepeatedTrader, identitySetterCounts(sprite, container), {
    texture: 0,
    frame: 0,
    origin: 0,
    depth: 0,
  });
  expect(rig.render).toHaveBeenCalledTimes(2);
  const beforeRegular = identitySetterCounts(sprite, container);

  actor.render(regular);

  expectSetterDelta(beforeRegular, identitySetterCounts(sprite, container), {
    texture: 1,
    frame: 1,
    origin: 0,
    depth: 0,
  });
  expect(lastCall(sprite, 'setActive')).toEqual([true]);
  expect(lastCall(sprite, 'setVisible')).toEqual([true]);
  expect(rig.reset).toHaveBeenCalledTimes(1);
});

it('EnemyActorPool은 Scene에서 60개를 한 번만 만들고 releaseAll 후 같은 actor를 재사용한다', () => {
  const fake = createFakeScene();
  const pool = new EnemyActorPool(fake.scene as never);
  const initial = pool.snapshot();
  const actors = Array.from({ length: 60 }, (_, id) => pool.acquire({ ...ENEMY_SNAPSHOT, id }));

  expect(fake.containers).toHaveLength(60);
  expect(fake.graphics).toHaveLength(0);
  expect(fake.images).toHaveLength(60);
  expect(fake.texts).toHaveLength(0);
  expect(fake.images.filter((image) => (
    lastCalls(image, 'create')[0]?.[2] === AssetKeys.enemyLabels
  ))).toHaveLength(60);
  expect(fake.images.filter((image) => (
    lastCalls(image, 'create')[0]?.[2] === AssetKeys.white
  ))).toHaveLength(0);
  expect(actors.every((actor) => actor !== undefined)).toBe(true);
  expect(pool.acquire({ ...ENEMY_SNAPSHOT, id: 60 })).toBeUndefined();
  expect(pool.snapshot()).toEqual({ ...initial, active: 60, available: 0 });

  pool.releaseAll();
  const reused = pool.acquire({ ...ENEMY_SNAPSHOT, id: 999 });

  expect(reused).toBe(actors.at(-1));
  expect(fake.containers).toHaveLength(60);
  expect(fake.images).toHaveLength(60);
  expect(pool.snapshot()).toEqual({ ...initial, active: 1, available: 59 });
});

it('runtime asset/preload와 CombatEffectPool에서 retired dog presentation을 참조하지 않는다', () => {
  const assetRuntimeFiles = [
    'src/game/assets/AssetKeys.ts',
    'src/game/assets/assetManifest.ts',
  ];
  const assetRuntimeSource = assetRuntimeFiles
    .map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    .join('\n');
  const combatEffectSource = readFileSync(
    new URL('../../src/game/combat/CombatEffectPool.ts', import.meta.url),
    'utf8',
  );

  expect(assetRuntimeSource).not.toMatch(/\/assets\/characters\/(?:huchu|deokbae)\.png/);
  expect(combatEffectSource).not.toContain('deokbaeHowl');
});

it('일반 로컬 GameScene은 파란 경로 디버그 선을 생성하지 않는다', () => {
  const sceneSource = readFileSync(
    new URL('../../src/game/scenes/GameScene.ts', import.meta.url),
    'utf8',
  );

  expect(sceneSource).not.toContain('DebugPathOverlay');
});

it('moving walk만 감속 배율을 적용하고 attack frame/fps는 core elapsed를 그대로 따른다', () => {
  expect(enemyAnimation({
    ...ENEMY_SNAPSHOT,
    state: 'moving',
    moveSpeedMultiplier: 0.6,
    animationElapsedMs: 500,
  })).toMatchObject({ action: 'walk', fps: 6, frame: 3 });
  expect(enemyAnimation({
    ...ENEMY_SNAPSHOT,
    kind: 'illegalBreeder',
    state: 'windup',
    moveSpeedMultiplier: 0.2,
    animationElapsedMs: 500,
  })).toMatchObject({ action: 'attack', fps: 10, frame: 5 });
});

it.each([0.7, 0.5])(
  'EnemyActor walk는 1→%s→1 전환에서 누적 phase를 역행하거나 raw clock으로 점프하지 않는다',
  (multiplier) => {
    const fake = createFakeScene();
    const actor = new EnemyActor(fake.scene as never);
    const sprite = fake.sprites.at(0)!;
    const renderedFrames: number[] = [];
    const render = (overrides: Partial<EnemySnapshot>): void => {
      actor.render({ ...ENEMY_SNAPSHOT, ...overrides });
      const frame = lastCall(sprite, 'setFrame')?.[0];
      if (typeof frame !== 'number') throw new Error('Enemy frame render call is missing');
      renderedFrames.push(frame);
    };

    render({ animationElapsedMs: 500, moveSpeedMultiplier: 1, slowRemainingMs: 0 });
    render({ animationElapsedMs: 500, moveSpeedMultiplier: multiplier, slowRemainingMs: 2_000 });
    render({ animationElapsedMs: 600, moveSpeedMultiplier: multiplier, slowRemainingMs: 1_900 });
    render({ animationElapsedMs: 700, moveSpeedMultiplier: multiplier, slowRemainingMs: 1_800 });
    render({ animationElapsedMs: 700, moveSpeedMultiplier: 1, slowRemainingMs: 0 });
    render({ animationElapsedMs: 800, moveSpeedMultiplier: 1, slowRemainingMs: 0 });

    expect(renderedFrames).toEqual([5, 5, 5, 0, 0, 1]);
  },
);

it('EnemyActor walk는 render 사이 slow 만료 구간과 정상 구간을 나눠 누적한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;

  actor.render({
    ...ENEMY_SNAPSHOT,
    animationElapsedMs: 500,
    moveSpeedMultiplier: 0.5,
    slowRemainingMs: 50,
  });
  expect(lastCall(sprite, 'setFrame')).toEqual([2]);

  actor.render({
    ...ENEMY_SNAPSHOT,
    animationElapsedMs: 600,
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
  });
  expect(lastCall(sprite, 'setFrame')).toEqual([3]);
});

it('EnemyActor attack은 앞선 movement clock과 multiplier 대신 raw clock을 유지한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;

  actor.render({
    ...ENEMY_SNAPSHOT,
    animationElapsedMs: 600,
    moveSpeedMultiplier: 0.5,
    slowRemainingMs: 900,
  });

  actor.render({
    ...ENEMY_SNAPSHOT,
    state: 'windup',
    animationElapsedMs: 500,
    moveSpeedMultiplier: 0.5,
    slowRemainingMs: 900,
  });
  expect(lastCall(sprite, 'setFrame')).toEqual([5]);
});

it('V2 enemy actor는 regular 84/boss 100 opaque height와 manifest texture를 사용한다', () => {
  expect(enemyDisplayHeight('poopGuardian')).toBe(84);
  expect(enemyDisplayHeight('offLeashGuardian')).toBe(84);
  expect(enemyDisplayHeight('dogTrader')).toBe(100);
  expect(enemyDisplayHeight('illegalBreeder')).toBe(100);
  expect(enemyTextureKey('poopGuardian', 'male', 'walk')).toBe('poop-male-walk');
  expect(enemyTextureKey('poopGuardian', 'male', 'attack')).toBe('poop-male-attack');
  expect(enemyTextureKey('illegalBreeder', 'female', 'attack')).toBe('breeder-female-attack');
});

it('BossHud는 제거되고 visibility/resync는 resumed render보다 composite pose를 먼저 snap한다', () => {
  expect(existsSync(new URL('../../src/game/ui/BossHud.ts', import.meta.url))).toBe(false);
  const sceneSource = readFileSync(
    new URL('../../src/game/scenes/GameScene.ts', import.meta.url),
    'utf8',
  );
  const visibilityBranch = sceneSource.slice(
    sceneSource.indexOf('setVisibilityForTest'),
    sceneSource.indexOf('forceModeForTest'),
  );
  expect(visibilityBranch.indexOf('snapCompositePoses()'))
    .toBeLessThan(visibilityBranch.indexOf('visibilityController.visible()'));
  const resyncBranch = sceneSource.slice(
    sceneSource.lastIndexOf('private resyncViewFromSnapshot'),
    sceneSource.lastIndexOf('private setWorldPaused'),
  );
  expect(resyncBranch.indexOf('snapCompositePoses()'))
    .toBeLessThan(resyncBranch.indexOf('renderEnemies()'));
});

const ENEMY_SNAPSHOT: EnemySnapshot = {
  id: 0,
  kind: 'poopGuardian',
  variant: 'male',
  state: 'moving',
  pathId: 'P1',
  pathProgress: 0,
  position: { x: 0, y: 0 },
  etaMs: 1000,
  currentHp: 35,
  maxHp: 35,
  spawnSequence: 0,
  isBoss: false,
  moveSpeedMultiplier: 1,
  slowRemainingMs: 0,
  dashCooldownRemainingMs: 4000,
  animationElapsedMs: 0,
};

interface FakeGameObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  listenerCount: number;
}

function createFakeScene(): {
  readonly scene: object;
  readonly sprites: FakeGameObject[];
  readonly graphics: FakeGameObject[];
  readonly images: FakeGameObject[];
  readonly texts: FakeGameObject[];
  readonly containers: FakeGameObject[];
} {
  const sprites: FakeGameObject[] = [];
  const graphics: FakeGameObject[] = [];
  const images: FakeGameObject[] = [];
  const texts: FakeGameObject[] = [];
  const containers: FakeGameObject[] = [];
  const create = (collection: FakeGameObject[]): object => {
    const fake = createFakeGameObject();
    collection.push(fake);
    return fake.object;
  };
  return {
    scene: {
      add: {
        sprite: () => create(sprites),
        graphics: () => create(graphics),
        image: (...args: unknown[]) => {
          const fake = createFakeGameObject();
          recordFakeCall(fake.calls, 'create', args);
          images.push(fake);
          return fake.object;
        },
        text: () => create(texts),
        container: () => create(containers),
      },
    },
    sprites,
    graphics,
    images,
    texts,
    containers,
  };
}

function createFakeGameObject(): FakeGameObject {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeGameObject = { object: {}, calls, listenerCount: 0 };
  const state: {
    width: number;
    height: number;
    frame: { name: string; width: number; height: number; customData: EnemyLabelCombinedFrameData } | null;
  } = { width: 1, height: 1, frame: null };
  const target = {};
  const object = new Proxy(target, {
    get: (_current, property) => {
      const name = String(property);
      if (name === 'width') return state.width;
      if (name === 'height') return state.height;
      if (name === 'frame') return state.frame;
      if (name === 'anims') {
        return {
          stop: (...args: unknown[]) => {
            recordFakeCall(calls, 'anims.stop', args);
          },
        };
      }
      return (...args: unknown[]) => {
        recordFakeCall(calls, name, args);
        if (name === 'removeAllListeners') fake.listenerCount = 0;
        if (name === 'setFrame' && typeof args[0] === 'string') {
          state.frame = createCombinedLabelFrame(String(args[0]));
          state.width = state.frame.width;
          state.height = state.frame.height;
        }
        return object;
      };
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}

function createCombinedLabelFrame(frameName: string): {
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
  const combinedWidth = Math.max(nameWidth, ENEMY_HP_BAR_WIDTH);
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
      hpOffsetX: (combinedWidth - ENEMY_HP_BAR_WIDTH) / 2,
      hpOffsetY: 0,
    },
  };
}

function recordFakeCall(calls: Map<string, unknown[][]>, name: string, args: unknown[]): void {
  const history = calls.get(name) ?? [];
  history.push(args);
  calls.set(name, history);
}

function lastCalls(fake: FakeGameObject, method: string): unknown[][] {
  return fake.calls.get(method) ?? [];
}

function lastCall(fake: FakeGameObject, method: string): unknown[] | undefined {
  return lastCalls(fake, method).at(-1);
}

function identitySetterCounts(
  sprite: FakeGameObject,
  container: FakeGameObject,
): Record<'texture' | 'frame' | 'origin' | 'depth', number> {
  return {
    texture: lastCalls(sprite, 'setTexture').length,
    frame: lastCalls(sprite, 'setFrame').length,
    origin: lastCalls(sprite, 'setOrigin').length,
    depth: lastCalls(container, 'setDepth').length,
  };
}

function dynamicSetterCounts(
  sprite: FakeGameObject,
  container: FakeGameObject,
): Record<
  | 'spritePosition'
  | 'rotation'
  | 'scale'
  | 'spriteActive'
  | 'spriteVisible'
  | 'containerPosition'
  | 'containerActive'
  | 'containerVisible',
  number
> {
  return {
    spritePosition: lastCalls(sprite, 'setPosition').length,
    rotation: lastCalls(sprite, 'setRotation').length,
    scale: lastCalls(sprite, 'setScale').length,
    spriteActive: lastCalls(sprite, 'setActive').length,
    spriteVisible: lastCalls(sprite, 'setVisible').length,
    containerPosition: lastCalls(container, 'setPosition').length,
    containerActive: lastCalls(container, 'setActive').length,
    containerVisible: lastCalls(container, 'setVisible').length,
  };
}

function expectSetterDelta<Keys extends string>(
  before: Record<Keys, number>,
  after: Record<Keys, number>,
  expected: Record<Keys, number>,
): void {
  expect(Object.fromEntries(
    Object.keys(before).map((key) => [key, after[key as Keys] - before[key as Keys]]),
  )).toEqual(expected);
}
