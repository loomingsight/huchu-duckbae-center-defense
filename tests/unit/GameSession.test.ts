import { FIXED_STEP_MS } from '../../src/game/constants';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { GameSession } from '../../src/game/session/GameSession';

const PLAYER = { x: 270, y: 650 } as const;

describe('GameSession', () => {
  it('bark cadence를 snapshot 없이 readonly number 단일값으로 제공한다', () => {
    const run = GameSession.create({ seed: 1 });

    expectTypeOf(run.barkCadenceMs()).toEqualTypeOf<number>();
    expect(run.barkCadenceMs()).toBe(650);
  });

  it('정지 중에는 simulationMs와 wave schedule이 증가하지 않는다', () => {
    const run = GameSession.create({ seed: 424242 });
    run.forceModeForTest('skillSelection');

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual([]);

    expect(run.snapshot()).toMatchObject({
      simulationMs: 0,
      mode: 'skillSelection',
      wave: 1,
      pendingSpawns: 10,
      activeEnemyCount: 0,
    });
  });

  it('playing fixed step 10초가 W1 spawn marker 10개를 exact 순서로 만든다', () => {
    const run = GameSession.create({ seed: 424242 });
    const events: GameEvent[] = [];

    for (let tick = 0; tick < 600; tick += 1) {
      events.push(...run.step(FIXED_STEP_MS, PLAYER));
    }

    expect(events.filter(({ type }) => type === 'enemySpawnRequested')).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
      type: 'enemySpawnRequested',
      request: {
        atMs: index * 1000,
        pathId: index % 2 === 0 ? 'P1' : 'P2',
        kind: 'poopGuardian',
        variant: index % 2 === 0 ? 'male' : 'female',
        spawnSequence: index,
      },
      })),
    );
    expect(run.snapshot()).toMatchObject({
      simulationMs: 10_000,
      wave: 1,
      pendingSpawns: 0,
      activeEnemyCount: 10,
    });
  });

  it('WaveSystem spawn을 EnemySystem에 추가한 뒤 같은 tick에 step하고 event를 flush한다', () => {
    const run = GameSession.create({ seed: 424242 });

    const events = run.step(FIXED_STEP_MS, PLAYER);

    expect(events).toEqual([
      {
        type: 'enemySpawnRequested',
        request: {
          atMs: 0,
          pathId: 'P1',
          kind: 'poopGuardian',
          variant: 'male',
          spawnSequence: 0,
        },
      },
      {
        type: 'enemySpawned',
        enemyId: 0,
        request: {
          atMs: 0,
          pathId: 'P1',
          kind: 'poopGuardian',
          variant: 'male',
          spawnSequence: 0,
        },
      },
    ]);
    const enemy = run.snapshot().enemies.at(0)!;
    expect(enemy).toMatchObject({
      id: 0,
      spawnSequence: 0,
      state: 'moving',
    });
    expect(enemy.pathProgress).toBeCloseTo(44 / 60, 12);
    expect(run.snapshot().activeEnemyCount).toBe(1);
  });

  it('snapshot은 Task 6의 전체 run 계약을 제공한다', () => {
    expect(GameSession.create({ seed: 1 }).snapshot()).toEqual({
      mode: 'playing',
      simulationMs: 0,
      wave: 1,
      pendingSpawns: 10,
      activeEnemyCount: 0,
      activeProjectileCount: 0,
      shelterHp: 100,
      snacks: 0,
      enemies: [],
      skills: {
        bark: 1,
        scold: 0,
        aquaBeam: 0,
        deokbaeHowl: 0,
        safetyReport: 0,
      },
    });
  });

  it('snapshot skills 외부 mutation이 다른 snapshot·session·reset을 오염시키지 않는다', () => {
    const first = GameSession.create({ seed: 1 });
    const exposed = first.snapshot().skills as { bark: number };

    try {
      exposed.bark = 3;
      const currentSnapshot = first.snapshot().skills.bark;
      const otherSession = GameSession.create({ seed: 2 }).snapshot().skills.bark;
      first.reset(3);
      const resetSnapshot = first.snapshot().skills.bark;

      expect([currentSnapshot, otherSession, resetSnapshot]).toEqual([1, 1, 1]);
    } finally {
      exposed.bark = 1;
    }
  });

  it('정확히 한 fixed step만 받고 invalid step은 mode와 무관하게 fail-fast한다', () => {
    const run = GameSession.create({ seed: 1 });
    run.forceModeForTest('countdown');

    for (const stepMs of [0, -FIXED_STEP_MS, FIXED_STEP_MS * 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => run.step(stepMs, PLAYER)).toThrow(RangeError);
    }
    expect(run.snapshot().simulationMs).toBe(0);
    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual([]);
  });

  it('reset은 canonical state object identity를 유지하며 모든 Task 6 run state를 초기화한다', () => {
    const run = GameSession.create({ seed: 1 });
    const canonicalState = run.modeStateForControllers();
    run.step(FIXED_STEP_MS, PLAYER);
    run.forceModeForTest('skillSelection');

    run.reset(424242);

    expect(run.modeStateForControllers()).toBe(canonicalState);
    expect(canonicalState.current()).toBe('playing');
    expect(run.snapshot()).toMatchObject({
      mode: 'playing',
      simulationMs: 0,
      wave: 1,
      pendingSpawns: 10,
      activeEnemyCount: 0,
      enemies: [],
    });
  });

  it('create/reset의 invalid seed는 fail-fast하고 기존 run state를 바꾸지 않는다', () => {
    for (const seed of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => GameSession.create({ seed })).toThrow(RangeError);
    }

    const run = GameSession.create({ seed: 1 });
    run.step(FIXED_STEP_MS, PLAYER);
    run.forceModeForTest('skillSelection');
    const before = run.snapshot();

    expect(() => run.reset(Number.NaN)).toThrow(RangeError);
    expect(run.snapshot()).toEqual(before);
  });

  it('visibility pause/resume도 session의 canonical state를 바꾼다', () => {
    const run = GameSession.create({ seed: 1 });

    run.requestVisibilityPause();
    expect(run.currentMode()).toBe('visibilityPause');
    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual([]);
    run.requestVisibilityResume();

    expect(run.currentMode()).toBe('playing');
    expect(run.modeStateForControllers().current()).toBe('playing');
  });
});
