import { FIXED_STEP_MS } from '../../src/game/constants';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { GameSession } from '../../src/game/session/GameSession';
import type { AutoSkillId } from '../../src/game/skills/SkillSystem';
import type { SkillCard } from '../../src/game/skills/SkillTypes';

const PLAYER = { x: 270, y: 650 } as const;
const SAFETY_PLAYER = { x: 270, y: 701 } as const;

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
      projectiles: [],
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

  it('마지막 enemy reward까지 처리한 tick 끝에 selection request 하나만 연다', () => {
    const run = GameSession.create({ seed: 1 });
    run.suppressWaveSpawnsForScenario();
    for (let index = 0; index < 7; index += 1) {
      const enemyId = run.spawnEnemyForScenario({
        kind: 'poopGuardian',
        variant: 'male',
        pathId: 'P6',
        placement: { kind: 'worldPoint', x: 50 + index, y: 50 },
        currentHp: 1,
        maxHp: 1000,
      });
      expect(run.damageEnemy(enemyId, 1).filter(({ type }) => type === 'snackEarned'))
        .toHaveLength(1);
      expect(run.damageEnemy(enemyId, 1)).toEqual([]);
    }
    run.spawnEnemyForScenario({
      kind: 'poopGuardian',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 270, y: 625 },
      currentHp: 10,
      maxHp: 1000,
      state: 'stunned',
      stunnedMs: 60_000,
    });

    const events: GameEvent[] = [];
    for (let tick = 0; tick < 15; tick += 1) events.push(...run.step(FIXED_STEP_MS, PLAYER));

    expect(run.snapshot()).toMatchObject({ mode: 'skillSelection', snacks: 8 });
    expect(run.currentCards()).toHaveLength(3);
    expect(new Set(run.currentCards().map(({ id }) => id)).size).toBe(3);
    expect(events.filter(({ type }) => type === 'snackEarned')).toHaveLength(1);
    expect(events.filter(({ type }) => type === 'modeChanged')).toEqual([
      { type: 'modeChanged', mode: 'skillSelection' },
    ]);
  });

  it('stored cards는 snapshot 조회마다 RNG를 다시 소비하지 않고 reset으로 재현된다', () => {
    const run = GameSession.create({ seed: 1 });

    openSelectionWithEightRewards(run);
    const first = run.currentCards();
    const second = run.currentCards();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);

    run.reset(1);
    openSelectionWithEightRewards(run);

    expect(run.currentCards()).toEqual(first);
  });

  it('bark card 선택은 level과 runtime damage를 함께 갱신하고 3초 뒤 재개한다', () => {
    const run = GameSession.create({ seed: 1 });
    openSelectionWithEightRewards(run);
    const barkCard = run.currentCards().find(({ id }) => id === 'bark:2')!;

    expect(barkCard).toBeDefined();
    run.selectCard(barkCard.id);
    expect(run.snapshot()).toMatchObject({
      mode: 'countdown',
      skills: { bark: 2, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    });
    expect(run.currentCards()).toEqual([]);
    expect(run.skillCooldownProgress()).toMatchObject({ bark: 0 });

    const enemyId = run.spawnEnemyForScenario({
      kind: 'illegalBreeder',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 270, y: 625 },
      currentHp: 1000,
      maxHp: 1000,
      state: 'stunned',
      stunnedMs: 60_000,
    });
    for (let tick = 0; tick < 179; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.currentMode()).toBe('countdown');
    expect(run.countdownState()).toMatchObject({ kind: 'nextWave' });
    run.step(FIXED_STEP_MS, PLAYER);
    expect(run.snapshot()).toMatchObject({ mode: 'playing', wave: 2 });
    for (let tick = 0; tick < 15; tick += 1) run.step(FIXED_STEP_MS, PLAYER);

    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)?.currentHp).toBe(987);
  });

  it('double select는 첫 선택만 적용하고 reset은 bark1, 나머지0과 progression을 복구한다', () => {
    const run = GameSession.create({ seed: 1 });
    openSelectionWithEightRewards(run);
    const card = run.currentCards().find(({ id }) => id === 'bark:2')!;

    run.selectCard(card.id);
    const selected = run.snapshot();
    expect(() => run.selectCard(card.id)).toThrow('Skill card can only be selected during skillSelection');
    expect(run.snapshot()).toEqual(selected);

    run.reset(2);

    expect(run.snapshot()).toMatchObject({
      mode: 'playing',
      snacks: 0,
      skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    });
    expect(run.currentCards()).toEqual([]);
  });

  it('non-bark 선택은 canonical level/order/cooldown을 원자적으로 갱신하고 reset한다', () => {
    const { run, card } = sessionOfferingUnlock('aquaBeam');

    run.selectCard(card.id);

    expect(run.skillStateSnapshot()).toMatchObject({
      levels: { bark: 1, aquaBeam: 1 },
      learnedOrder: ['aquaBeam'],
      cooldowns: {
        aquaBeam: {
          level: 1,
          cooldownRemainingMs: 9000,
          progress: 0,
          ready: false,
        },
      },
    });
    expect(run.snapshot().skills).toEqual(run.skillStateSnapshot().levels);
    expect(run.skillCooldownProgress()).toMatchObject({ aquaBeam: 0 });

    run.reset(99);

    expect(run.skillStateSnapshot()).toMatchObject({
      levels: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
      learnedOrder: [],
      cooldowns: { aquaBeam: { level: 0, ready: false } },
    });
  });

  it('호통은 같은 tick attack release보다 먼저 damage와 absolute progress/attack sync를 적용한다', () => {
    const { run, card } = sessionOfferingUnlock('scold');
    run.selectCard(card.id);
    finishSelectionCountdown(run);
    seedCooldownAnchor(run);
    for (let tick = 0; tick < 465; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    const enemyId = run.spawnEnemyForScenario({
      kind: 'offLeashGuardian',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'attackBoundary' },
      currentHp: 10_000,
      maxHp: 10_000,
    });
    const beforeProgress = run.snapshot().enemies.find(({ id }) => id === enemyId)!.pathProgress;
    for (let tick = 0; tick < 14; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.skillStateSnapshot().cooldowns.scold.cooldownRemainingMs)
      .toBeCloseTo(FIXED_STEP_MS, 8);

    const boundaryEvents = run.step(FIXED_STEP_MS, PLAYER);

    const cast = boundaryEvents.find((event) => event.type === 'skillCast');
    expect(cast).toMatchObject({
      type: 'skillCast',
      skillId: 'scold',
      targetIds: [enemyId],
      hits: [{
        targetId: enemyId,
        damage: 20,
        nextPathProgress: beforeProgress - 28,
      }],
    });
    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)).toMatchObject({
      currentHp: 9970,
      pathProgress: beforeProgress - 28,
      state: 'moving',
    });
    expect(boundaryEvents.some(({ type }) => type === 'shelterDamageRequested')).toBe(false);
    expect(run.snapshot().shelterHp).toBe(100);
  });

  it('lethal auto skill은 death/snack/attack cleanup을 한 번만 하고 후속 knockback state를 만들지 않는다', () => {
    const { run, card } = sessionOfferingUnlock('scold');
    run.selectCard(card.id);
    finishSelectionCountdown(run);
    seedCooldownAnchor(run);
    for (let tick = 0; tick < 465; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    const enemyId = run.spawnEnemyForScenario({
      kind: 'offLeashGuardian',
      variant: 'female',
      pathId: 'P6',
      placement: { kind: 'attackBoundary' },
      currentHp: 20,
      maxHp: 10_000,
    });
    for (let tick = 0; tick < 14; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.skillStateSnapshot().cooldowns.scold.cooldownRemainingMs)
      .toBeCloseTo(FIXED_STEP_MS, 8);

    const lethalEvents = run.step(FIXED_STEP_MS, PLAYER);
    const cast = lethalEvents.find((event) => event.type === 'skillCast');

    expect(cast).toMatchObject({
      skillId: 'scold',
      visual: {
        kind: 'scold',
        origin: PLAYER,
        targetPositions: [expect.objectContaining({ targetId: enemyId })],
      },
    });
    expect(lethalEvents.filter((event) => event.type === 'enemyDied' && event.enemyId === enemyId))
      .toHaveLength(1);
    expect(lethalEvents.filter((event) => event.type === 'snackEarned' && event.enemyId === enemyId))
      .toHaveLength(1);
    expect(lethalEvents.some(({ type }) => type === 'shelterDamageRequested')).toBe(false);
    expect(run.snapshot().enemies.some(({ id }) => id === enemyId)).toBe(false);
    expect(run.snapshot().snacks).toBe(10);

    const later = run.step(FIXED_STEP_MS, PLAYER);
    expect(later.filter((event) => event.type === 'enemyDied' || event.type === 'snackEarned'))
      .toEqual([]);
    expect(run.snapshot().snacks).toBe(10);
  });

  it('안전신문고 nonlethal hit는 damage 뒤 stun을 적용하고 attack track도 같은 duration으로 동기화한다', () => {
    const { run, card } = sessionOfferingUnlock('safetyReport');
    run.selectCard(card.id);
    finishSelectionCountdown(run);
    seedCooldownAnchor(run);
    for (let tick = 0; tick < 1185; tick += 1) run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    const enemyId = run.spawnEnemyForScenario({
      kind: 'offLeashGuardian',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'attackBoundary' },
      currentHp: 10_000,
      maxHp: 10_000,
    });
    for (let tick = 0; tick < 14; tick += 1) run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    expect(run.skillStateSnapshot().cooldowns.safetyReport.cooldownRemainingMs)
      .toBeCloseTo(FIXED_STEP_MS, 8);

    const boundaryEvents = run.step(FIXED_STEP_MS, SAFETY_PLAYER);

    expect(boundaryEvents.find((event) => event.type === 'skillCast')).toMatchObject({
      skillId: 'safetyReport',
      hits: [{ targetId: enemyId, damage: 90, stunMs: 3000 }],
    });
    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)).toMatchObject({
      currentHp: 9910,
      state: 'stunned',
      stunnedMs: 3000,
    });
    expect(boundaryEvents.some(({ type }) => type === 'shelterDamageRequested')).toBe(false);
    expect(run.snapshot().shelterHp).toBe(100);
  });

  it('안전신문고의 짧은 재기절은 기존 9초 stun과 attack track을 같은 remaining으로 보존한다', () => {
    const { run, card } = sessionOfferingUnlock('safetyReport');
    run.selectCard(card.id);
    finishSelectionCountdown(run);
    seedCooldownAnchor(run);
    for (let tick = 0; tick < 1185; tick += 1) run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    const enemyId = run.spawnEnemyForScenario({
      kind: 'offLeashGuardian',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'attackBoundary' },
      currentHp: 10_000,
      maxHp: 10_000,
      state: 'stunned',
      stunnedMs: 9000,
    });
    for (let tick = 0; tick < 14; tick += 1) run.step(FIXED_STEP_MS, SAFETY_PLAYER);

    const castEvents = run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    const afterCast = run.snapshot().enemies.find(({ id }) => id === enemyId)!;

    expect(castEvents.find((event) => event.type === 'skillCast')).toMatchObject({
      skillId: 'safetyReport',
      hits: [{ targetId: enemyId, damage: 90, stunMs: 3000 }],
    });
    expect(afterCast).toMatchObject({ currentHp: 9910, state: 'stunned' });
    expect(afterCast.stunnedMs).toBeCloseTo(9000 - 15 * FIXED_STEP_MS, 8);

    const firstThreeSeconds: GameEvent[] = [];
    for (let tick = 0; tick < 180; tick += 1) {
      firstThreeSeconds.push(...run.step(FIXED_STEP_MS, SAFETY_PLAYER));
    }
    const afterThreeSeconds = run.snapshot().enemies.find(({ id }) => id === enemyId)!;

    expect(afterThreeSeconds.state).toBe('stunned');
    expect(afterThreeSeconds.stunnedMs).toBeCloseTo(9000 - 195 * FIXED_STEP_MS, 8);
    expect(firstThreeSeconds.filter(({ type }) => (
      type === 'attackStarted' || type === 'shelterDamageRequested'
    ))).toEqual([]);

    const beforeReleaseEvents: GameEvent[] = [];
    for (let tick = 0; tick < 344; tick += 1) {
      beforeReleaseEvents.push(...run.step(FIXED_STEP_MS, SAFETY_PLAYER));
    }
    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)).toMatchObject({
      state: 'stunned',
      stunnedMs: expect.closeTo(FIXED_STEP_MS, 8),
    });
    expect(beforeReleaseEvents.filter(({ type }) => type === 'attackStarted')).toEqual([]);

    const releaseEvents = run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    expect(releaseEvents.filter(({ type }) => type === 'attackStarted')).toEqual([]);
    expect(run.snapshot().enemies.find(({ id }) => id === enemyId)).toMatchObject({
      state: 'moving',
      stunnedMs: 0,
    });

    const firstActiveEvents = run.step(FIXED_STEP_MS, SAFETY_PLAYER);
    expect(firstActiveEvents.filter(({ type }) => type === 'attackStarted')).toEqual([
      { type: 'attackStarted', enemyId },
    ]);
  });

  it('skill due 없는 wave clear는 next wave countdown 하나를 즉시 시작한다', () => {
    const run = GameSession.create({ seed: 1 });
    run.suppressWaveSpawnsForScenario();

    run.step(FIXED_STEP_MS, PLAYER);

    expect(run.snapshot()).toMatchObject({ mode: 'countdown', wave: 1, snacks: 0 });
    expect(run.countdownState()).toEqual({ kind: 'nextWave', remainingMs: 3000 });
    for (let tick = 0; tick < 180; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.snapshot()).toMatchObject({ mode: 'playing', wave: 2 });
  });

});

function openSelectionWithEightRewards(run: GameSession): void {
  run.suppressWaveSpawnsForScenario();
  for (let index = 0; index < 8; index += 1) {
    const enemyId = run.spawnEnemyForScenario({
      kind: 'poopGuardian',
      variant: 'male',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 50 + index, y: 50 },
      currentHp: 1,
      maxHp: 1000,
    });
    run.damageEnemy(enemyId, 1);
  }
  run.step(FIXED_STEP_MS, PLAYER);
  expect(run.currentMode()).toBe('skillSelection');
}

function sessionOfferingUnlock(id: AutoSkillId): {
  readonly run: GameSession;
  readonly card: SkillCard;
} {
  for (let seed = 1; seed <= 100; seed += 1) {
    const run = GameSession.create({ seed });
    openSelectionWithEightRewards(run);
    const card = run.currentCards().find((candidate) => (
      candidate.skillId === id && candidate.kind === 'unlock'
    ));
    if (card !== undefined) return { run, card };
  }
  throw new Error(`No deterministic seed offered ${id}`);
}

function finishSelectionCountdown(run: GameSession): void {
  for (let tick = 0; tick < 180; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
  expect(run.currentMode()).toBe('playing');
}

function seedCooldownAnchor(run: GameSession): void {
  run.spawnEnemyForScenario({
    kind: 'offLeashGuardian',
    variant: 'male',
    pathId: 'P1',
    placement: { kind: 'worldPoint', x: 110, y: 0 },
    currentHp: 10_000,
    maxHp: 10_000,
    state: 'stunned',
    stunnedMs: 60_000,
  });
}
