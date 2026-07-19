import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  ENEMY_FRAME_HEIGHT,
  ENEMY_FRAME_WIDTH,
  enemyAttackFrameAt,
  enemyDisplayHeight,
  enemyFrameAt,
  enemyTextureKey,
  enemyWalkFrameAt,
  EnemyActor,
} from '../../src/game/enemies/EnemyActor';
import { EnemyActorPool } from '../../src/game/enemies/EnemyActorPool';
import {
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpColor,
  enemyHpRatio,
} from '../../src/game/enemies/EnemyHpBar';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';

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

it('192x256 frame과 적 종류별 표시 높이를 고정한다', () => {
  expect([ENEMY_FRAME_WIDTH, ENEMY_FRAME_HEIGHT]).toEqual([192, 256]);
  expect(enemyDisplayHeight('poopGuardian')).toBe(82);
  expect(enemyDisplayHeight('offLeashGuardian')).toBe(82);
  expect(enemyDisplayHeight('dogTrader')).toBe(102);
  expect(enemyDisplayHeight('illegalBreeder')).toBe(106);
});

it('적 kind·variant를 승인된 texture key로 결정한다', () => {
  expect(enemyTextureKey('poopGuardian', 'male')).toBe(AssetKeys.poopMale);
  expect(enemyTextureKey('poopGuardian', 'female')).toBe(AssetKeys.poopFemale);
  expect(enemyTextureKey('offLeashGuardian', 'male')).toBe(AssetKeys.offLeashMale);
  expect(enemyTextureKey('offLeashGuardian', 'female')).toBe(AssetKeys.offLeashFemale);
  expect(enemyTextureKey('dogTrader', 'male')).toBe(AssetKeys.trader);
  expect(enemyTextureKey('dogTrader', 'female')).toBe(AssetKeys.trader);
  expect(enemyTextureKey('illegalBreeder', 'male')).toBe(AssetKeys.breederMale);
  expect(enemyTextureKey('illegalBreeder', 'female')).toBe(AssetKeys.breederFemale);
});

it('walk 0~3 6fps loop와 attack 4~7 8fps one-shot을 pure resolver로 결정한다', () => {
  expect([0, 167, 334, 501, 668].map(enemyWalkFrameAt)).toEqual([0, 1, 2, 3, 0]);
  expect([0, 125, 250, 375, 900].map(enemyAttackFrameAt)).toEqual([4, 5, 6, 7, 7]);
  expect(enemyFrameAt('moving', 167)).toBe(1);
  expect(enemyFrameAt('stunned', 0)).toBe(0);
  expect(enemyFrameAt('windup', 250)).toBe(6);
  expect(enemyFrameAt('holding', 900)).toBe(7);
  expect(enemyFrameAt('dead', 0)).toBe(7);
});

it('presentation resolver의 unknown enum·invalid elapsed를 fail-fast한다', () => {
  expect(() => enemyDisplayHeight('unknown' as never)).toThrow(RangeError);
  expect(() => enemyTextureKey('poopGuardian', 'unknown' as never)).toThrow(RangeError);
  expect(() => enemyFrameAt('unknown' as never, 0)).toThrow(RangeError);
  expect(() => enemyFrameAt('moving', Number.NaN)).toThrow(RangeError);
});

it('EnemyActor는 feet origin/depth와 full HP bar를 그리고 reset에서 모든 view 상태·listener를 초기화한다', () => {
  const fake = createFakeScene();
  const actor = new EnemyActor(fake.scene as never);
  const sprite = fake.sprites.at(0)!;
  const graphics = fake.graphics.at(0)!;
  const container = fake.containers.at(0)!;
  sprite.listenerCount = 2;
  graphics.listenerCount = 2;
  container.listenerCount = 2;

  actor.render({
    ...ENEMY_SNAPSHOT,
    kind: 'illegalBreeder',
    variant: 'female',
    state: 'holding',
    position: { x: 321, y: 654 },
    currentHp: 1000,
    maxHp: 1000,
    animationElapsedMs: 250,
  });

  expect(lastCall(sprite, 'setTexture')).toEqual([AssetKeys.breederFemale]);
  expect(lastCall(sprite, 'setFrame')).toEqual([6]);
  expect(lastCall(sprite, 'setOrigin')).toEqual([0.5, 1]);
  expect(lastCall(sprite, 'setDisplaySize')).toEqual([79.5, 106]);
  expect(lastCall(graphics, 'setPosition')).toEqual([0, -112]);
  expect(lastCalls(graphics, 'fillRect').slice(-2)).toEqual([
    [-15, -2, 30, 4],
    [-15, -2, 30, 4],
  ]);
  expect(lastCall(container, 'setPosition')).toEqual([321, 654]);
  expect(lastCall(container, 'setDepth')).toEqual([654]);

  actor.reset();

  expect(lastCall(sprite, 'setTexture')).toEqual([AssetKeys.poopMale]);
  expect(lastCall(sprite, 'setFrame')).toEqual([0]);
  expect(lastCall(sprite, 'setAlpha')).toEqual([1]);
  expect(lastCall(sprite, 'clearTint')).toEqual([]);
  expect(lastCall(sprite, 'anims.stop')).toEqual([]);
  expect(lastCall(sprite, 'setActive')).toEqual([false]);
  expect(lastCall(sprite, 'setVisible')).toEqual([false]);
  expect(lastCall(graphics, 'setPosition')).toEqual([0, 0]);
  expect(lastCall(graphics, 'setAlpha')).toEqual([1]);
  expect(lastCall(graphics, 'setActive')).toEqual([false]);
  expect(lastCall(graphics, 'setVisible')).toEqual([false]);
  expect(lastCall(container, 'setPosition')).toEqual([0, 0]);
  expect(lastCall(container, 'setDepth')).toEqual([0]);
  expect(lastCall(container, 'setActive')).toEqual([false]);
  expect(lastCall(container, 'setVisible')).toEqual([false]);
  expect([sprite.listenerCount, graphics.listenerCount, container.listenerCount]).toEqual([0, 0, 0]);
});

it('EnemyActorPool은 Scene에서 60개를 한 번만 만들고 releaseAll 후 같은 actor를 재사용한다', () => {
  const fake = createFakeScene();
  const pool = new EnemyActorPool(fake.scene as never);
  const initial = pool.snapshot();
  const actors = Array.from({ length: 60 }, (_, enemyId) => pool.acquire(enemyId));

  expect(fake.containers).toHaveLength(60);
  expect(actors.every((actor) => actor !== undefined)).toBe(true);
  expect(pool.acquire(60)).toBeUndefined();
  expect(pool.snapshot()).toEqual({ ...initial, active: 60, available: 0 });

  pool.releaseAll();
  const reused = pool.acquire(999);

  expect(reused).toBe(actors.at(-1));
  expect(fake.containers).toHaveLength(60);
  expect(pool.snapshot()).toEqual({ ...initial, active: 1, available: 59 });
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
  stunnedMs: 0,
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
  readonly containers: FakeGameObject[];
} {
  const sprites: FakeGameObject[] = [];
  const graphics: FakeGameObject[] = [];
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
        container: () => create(containers),
      },
    },
    sprites,
    graphics,
    containers,
  };
}

function createFakeGameObject(): FakeGameObject {
  const calls = new Map<string, unknown[][]>();
  const fake: FakeGameObject = { object: {}, calls, listenerCount: 0 };
  const target = {};
  const object = new Proxy(target, {
    get: (_current, property) => {
      const name = String(property);
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
        return object;
      };
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
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
