import { FIXED_STEP_MS } from '../../src/game/constants';
import type { AttackOriginResolver } from '../../src/game/combat/EnemyAttackSystem';
import type { ProjectileSpawn } from '../../src/game/combat/ProjectileSystem';
import { BALANCE } from '../../src/game/data/balance';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import { PlayerHealthSystem } from '../../src/game/player/PlayerHealthSystem';
import {
  GameSession,
  type GameSessionDependencies,
} from '../../src/game/session/GameSession';
import type { EnemyKind, PathId, PurchasableSkillId } from '../../src/game/types/GameTypes';
import { WaveSystem } from '../../src/game/waves/WaveSystem';

const PLAYER = { x: 270, y: 600 } as const;

describe('GameSession V2 fixed-step integration', () => {
  it('malformed purchase ID를 queue/tick 변경 전에 거부하고 이후 valid purchase를 처리한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const run = GameSession.create({ seed: 99 }, { progression });
    const before = run.snapshot();

    expect(() => run.queueSkillPurchase('bark' as never)).toThrow(RangeError);
    expect(run.snapshot()).toEqual(before);
    expect(run.snapshot().simulationMs).toBe(0);

    expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({ status: 'queued' });
    expect(run.step(FIXED_STEP_MS, PLAYER)).toContainEqual(
      expect.objectContaining({ type: 'skillPurchaseResolved' }),
    );
  });

  it('purchase는 다음 playing step 첫 단계에서 확정되고 world가 계속 돈다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const run = GameSession.create({ seed: 1 }, { progression });

    expect(run.queueSkillPurchase('tailSwipe')).toEqual({
      status: 'queued', skillId: 'tailSwipe', cost: 15, spent: 0, snacks: 40, nextCost: 15,
    });
    expect(run.queueSkillPurchase('aquaBeam').status).toBe('queueBusy');
    const before = run.snapshot();
    const events = run.step(FIXED_STEP_MS, PLAYER);

    expect(events).toContainEqual({
      type: 'skillPurchaseResolved',
      result: {
        status: 'learned', skillId: 'tailSwipe', cost: 15,
        spent: 15, snacks: 25, nextCost: 25,
      },
    });
    expect(events.findIndex((event) => event.type === 'skillPurchaseResolved'))
      .toBeLessThan(events.findIndex((event) => event.type === 'waveStarted'));
    expect(events.findIndex((event) => event.type === 'skillPurchaseResolved'))
      .toBeLessThan(events.findIndex((event) => event.type === 'enemySpawnRequested'));
    expect(run.snapshot()).toMatchObject({
      mode: 'playing', simulationMs: before.simulationMs + FIXED_STEP_MS,
      nextSkillCost: 25, pendingSpawns: 8, activeEnemyCount: 2,
    });
  });

  it('RunSnapshot은 V2 HUD와 projectile actor 계약을 제공한다', () => {
    const run = Harness.createHarness(2);
    run.suppressWave(1);
    run.spawnProjectile(projectile({ id: 9 }));

    expect(run.snapshot()).toMatchObject({
      mode: 'playing', simulationMs: 0, wave: 1,
      playerHp: 1000, playerMaxHp: 1000, snacks: 0, nextSkillCost: 15,
      learnedSkills: { tailSwipe: false, aquaBeam: false, safetyReport: false },
      skillStates: {
        tailSwipe: { learned: false, activeCastId: null },
        aquaBeam: { learned: false, activeCastId: null },
        safetyReport: { learned: false, activeCastId: null },
      },
      companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 0 },
      enemies: [], pendingSpawns: 0, activeEnemyCount: 0,
      activeProjectileCount: 1,
      projectiles: [expect.objectContaining({ id: 9, x: 20, y: 20 })],
    });
    expect(run.snapshot().activeProjectileCount).toBe(run.snapshot().projectiles.length);
  });

  it('simulationMs는 오직 fixed tick 수에서 계산하고 invalid step/player는 상태 변경 전에 거부한다', () => {
    const run = GameSession.create({ seed: 1 });
    for (let tick = 0; tick < 3; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.snapshot().simulationMs).toBe(3 * 1000 / 60);
    const before = run.snapshot();

    for (const stepMs of [
      0,
      -FIXED_STEP_MS,
      FIXED_STEP_MS + 1e-9,
      FIXED_STEP_MS * 2,
      Number.NaN,
      Infinity,
    ]) {
      expect(() => run.step(stepMs, PLAYER)).toThrow(RangeError);
    }
    expect(() => run.step(FIXED_STEP_MS, { x: Number.NaN, y: 0 })).toThrow(RangeError);
    expect(run.snapshot()).toEqual(before);
  });

  it('tail impact가 같은 step release를 취소하고 이미 release된 projectile은 유지한다', () => {
    const run = Harness.createHarness(3);
    run.suppressWave(1);
    const enemyId = run.spawnEnemy('poopGuardian', 'P6');
    run.placeAt(enemyId, { x: PLAYER.x, y: PLAYER.y + 150 });
    run.learnAt('tailSwipe', 0);
    run.setSimulationTicks(479);
    expect(run.step(FIXED_STEP_MS, PLAYER)).toContainEqual(
      expect.objectContaining({ type: 'skillCastStarted', skillId: 'tailSwipe' }),
    );
    run.placeAt(enemyId, PLAYER);
    const attackStartedEvents = run.step(FIXED_STEP_MS, PLAYER);
    const attackStarted = findAttackStarted(attackStartedEvents);
    expect(attackStarted).toEqual({
      type: 'attackStarted', castId: `enemy:${enemyId}:1`, enemyId, kind: 'poopGuardian',
    });
    run.spawnProjectile(projectile({
      id: 77,
      castId: attackStarted!.castId,
      enemyId,
      kind: attackStarted!.kind,
      speed: 1,
      lifeMs: 60_000,
    }));
    const events = steps(run, 14);

    const impactIndex = events.findIndex((event) => event.type === 'skillImpact');
    const cancelIndex = events.findIndex((event) => event.type === 'attackCancelled');
    expect(impactIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThan(impactIndex);
    expect(events[cancelIndex]).toEqual({
      type: 'attackCancelled',
      castId: attackStarted!.castId,
      enemyId: attackStarted!.enemyId,
      kind: attackStarted!.kind,
    });
    expect(events.some((event) => event.type === 'projectileRequested')).toBe(false);
    expect(events.some((event) => event.type === 'playerDamageRequested')).toBe(false);
    expect(run.snapshot().projectiles).toEqual([
      expect.objectContaining({ id: 77 }),
    ]);
  });

  it('damageApplied를 lifecycle/reward보다 먼저 내고 reward snapshot을 갱신한다', () => {
    const run = Harness.createHarness(4);
    run.suppressWave(1);
    const enemyId = run.spawnEnemy('poopGuardian', 'P6');
    run.place(enemyId, 335);
    run.weaken(enemyId, 1);

    const events = stepsUntil(run, (event) => event.type === 'enemyDied', 30);
    const damageIndex = events.findIndex((event) => event.type === 'damageApplied');
    const deathIndex = events.findIndex((event) => event.type === 'enemyDied');
    const rewardIndex = events.findIndex((event) => event.type === 'snackEarned');

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(deathIndex).toBeGreaterThan(damageIndex);
    expect(rewardIndex).toBeGreaterThan(deathIndex);
    expect(events[deathIndex]).toMatchObject({ kind: 'poopGuardian', position: expect.any(Object) });
    expect(events[rewardIndex]).toMatchObject({ kind: 'poopGuardian', amount: 2, snacks: 2 });
    expect(run.snapshot().snacks).toBe(2);
  });

  it('structured player request를 상세 playerDamaged로 손실 없이 바꾼다', () => {
    const playerHealth = new PlayerHealthSystem(1000, 900);
    const run = Harness.createHarness(5, { playerHealth });
    run.suppressWave(1);
    run.spawnProjectile(projectile({
      id: 41, castId: 'enemy:41:1', enemyId: 41, kind: 'dogTrader',
      projectileKind: 'net', from: { x: 270, y: 625 }, to: PLAYER,
      speed: 120, damage: 120,
    }));

    const events = run.step(FIXED_STEP_MS, PLAYER);
    expect(events.find((event) => event.type === 'playerDamageRequested')).toMatchObject({
      castId: 'enemy:41:1', sourceEnemyId: 41, sourceEnemyKind: 'dogTrader',
      amount: 120, position: PLAYER, strength: 'heavy',
    });
    expect(events.find((event) => event.type === 'playerDamaged')).toMatchObject({
      castId: 'enemy:41:1', appliedAtStep: 1,
      sourceEnemyId: 41, sourceEnemyKind: 'dogTrader', amount: 120,
      effectiveAmount: 120, hp: 780, maxHp: 1000, lethal: false,
      position: PLAYER, impactDirection: expect.any(Object), strength: 'heavy',
    });
    expect(run.snapshot()).toMatchObject({ playerHp: 780, playerMaxHp: 1000 });
  });

  it('boss active event는 두 boss의 0→1과 1→0에만 발생한다', () => {
    const run = Harness.createHarness(6);
    run.suppressWave(1);
    const firstId = run.spawnEnemy('dogTrader', 'P6');

    const firstSpawn = run.step(FIXED_STEP_MS, PLAYER);
    expect(firstSpawn.filter((event) => event.type === 'bossActiveChanged')).toEqual([
      { type: 'bossActiveChanged', active: true, activeBossCount: 1 },
    ]);

    const secondId = run.spawnEnemy('illegalBreeder', 'P6');
    const secondSpawn = run.step(FIXED_STEP_MS, PLAYER);
    expect(secondSpawn.filter((event) => event.type === 'bossActiveChanged')).toEqual([]);
    expect(activeBossCount(run)).toBe(2);

    run.place(firstId, 335);
    run.weaken(firstId, 1);
    const firstKill = stepsUntil(
      run,
      (event) => event.type === 'enemyDied' && event.enemyId === firstId,
      120,
    );
    expect(firstKill.some((event) => event.type === 'enemyDied' && event.enemyId === firstId))
      .toBe(true);
    expect(firstKill.filter((event) => event.type === 'bossActiveChanged')).toEqual([]);
    expect(activeBossCount(run)).toBe(1);

    run.place(secondId, 335);
    run.weaken(secondId, 1);
    const secondKill = stepsUntil(
      run,
      (event) => event.type === 'enemyDied' && event.enemyId === secondId,
      120,
    );
    expect(secondKill.filter((event) => event.type === 'bossActiveChanged')).toEqual([
      { type: 'bossActiveChanged', active: false, activeBossCount: 0 },
    ]);
    expect(activeBossCount(run)).toBe(0);
  });

  it('projectileOriginByKind pure dependency를 attack request와 reset 뒤에도 사용한다', () => {
    const origin: AttackOriginResolver = () => ({ x: 111, y: 222 });
    const run = Harness.createHarness(7, { projectileOriginByKind: { dogTrader: origin } });
    run.suppressWave(1);
    const id = run.spawnEnemy('dogTrader', 'P6');
    run.place(id, 1_000_000);

    expect(steps(run, 30).find((event) => event.type === 'projectileRequested'))
      .toMatchObject({ kind: 'dogTrader', from: { x: 111, y: 222 } });
    run.reset(8);
    run.suppressWave(1);
    const resetId = run.spawnEnemy('dogTrader', 'P6');
    run.place(resetId, 1_000_000);
    expect(steps(run, 30).find((event) => event.type === 'projectileRequested'))
      .toMatchObject({ from: { x: 111, y: 222 } });
  });

  it('주입 progression의 기존 learned state를 skill runtime과 일치시킨다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    progression.queuePurchase('tailSwipe');
    progression.consumeQueuedPurchase();

    const run = GameSession.create({ seed: 9 }, { progression });

    expect(run.snapshot()).toMatchObject({
      learnedSkills: { tailSwipe: true },
      skillStates: { tailSwipe: { learned: true } },
    });
  });

  it('실제 W1 schedule의 pending과 active가 모두 소진된 뒤에만 countdown으로 전환한다', () => {
    const run = Harness.createHarness(17);
    const events: GameEvent[] = [];

    for (let tick = 0; tick < 3000 && run.currentMode() === 'playing'; tick += 1) {
      events.push(...run.step(FIXED_STEP_MS, PLAYER));
      run.prepareActiveEnemiesForClear();
    }

    expect(events.filter((event) => event.type === 'enemySpawnRequested')).toHaveLength(10);
    expect(events.filter((event) => event.type === 'enemyDied')).toHaveLength(10);
    expect(run.snapshot()).toMatchObject({
      mode: 'countdown', wave: 1, pendingSpawns: 0, activeEnemyCount: 0,
    });
    expect(events.filter((event) => event.type === 'waveTransition')).toEqual([
      { type: 'waveTransition', fromWave: 1, toWave: 2, countdownMs: 3000 },
    ]);
  });
});

describe('GameSession terminal and transition priority', () => {
  it('wave 사이는 정확히 3000ms이고 countdown에서는 simulation tick이 멈춘다', () => {
    const run = Harness.createHarness(10);
    run.suppressWave(1);

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'countdown' },
      { type: 'waveTransition', fromWave: 1, toWave: 2, countdownMs: 3000 },
      { type: 'waveCountdownChanged', remainingMs: 3000 },
    ]));
    expect(run.countdownState()).toEqual({ kind: 'nextWave', remainingMs: 3000 });
    const simulationMs = run.snapshot().simulationMs;
    steps(run, 179);
    expect(run.snapshot()).toMatchObject({ mode: 'countdown', simulationMs });
    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual([
      { type: 'waveStarted', wave: 2 },
      { type: 'modeChanged', mode: 'playing' },
    ]);
  });

  it('lost result는 1200ms 뒤 한 번만 준비되고 terminal은 purchase/world를 무시한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const run = GameSession.create(
      { seed: 11 },
      { progression, playerHealth: new PlayerHealthSystem(1000, 0) },
    );

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'lost' },
      { type: 'runEnded', outcome: 'lost' },
    ]));
    const terminal = run.snapshot();
    expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({
      status: 'queueBusy', spent: 0, snacks: 40,
    });
    const early = steps(run, 71);
    expect(early.some((event) => event.type === 'resultReady')).toBe(false);
    expect(run.snapshot().simulationMs).toBe(terminal.simulationMs);
    expect(run.step(FIXED_STEP_MS, PLAYER).filter((event) => event.type === 'resultReady'))
      .toEqual([{ type: 'resultReady', outcome: 'lost' }]);
    expect(steps(run, 10).some((event) => event.type === 'resultReady')).toBe(false);
  });

  it('final clear와 loss가 같은 step이면 lost만 한 번 확정한다', () => {
    const run = Harness.createHarness(12, { playerHealth: new PlayerHealthSystem(1000, 0) });
    run.suppressWave(5);

    const events = run.step(FIXED_STEP_MS, PLAYER);
    expect(events.filter((event) => event.type === 'runEnded')).toEqual([
      { type: 'runEnded', outcome: 'lost' },
    ]);
    expect(events).not.toContainEqual({ type: 'runEnded', outcome: 'won' });
  });

  it('final clear 승리는 run/result event를 같은 step 한 번만 낸다', () => {
    const run = Harness.createHarness(13);
    run.suppressWave(5);

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'won' },
      { type: 'runEnded', outcome: 'won' },
      { type: 'resultReady', outcome: 'won' },
    ]));
    expect(steps(run, 10)).toEqual([]);
  });

  it('dependency reset은 주입 instance를 초기화하고 default session끼리 상태를 공유하지 않는다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const playerHealth = new PlayerHealthSystem(1000, 900);
    const first = GameSession.create({ seed: 14 }, { progression, playerHealth });
    const second = GameSession.create({ seed: 15 });
    first.queueSkillPurchase('tailSwipe');
    first.step(FIXED_STEP_MS, PLAYER);

    first.reset(16);

    expect(progression.snapshot()).toMatchObject({ snacks: 0, queuedSkillId: null });
    expect(playerHealth.currentHp).toBe(1000);
    expect(first.snapshot()).toMatchObject({ snacks: 0, playerHp: 1000, simulationMs: 0 });
    expect(second.snapshot()).toMatchObject({ snacks: 0, playerHp: 1000, simulationMs: 0 });
  });

  it('maxHp 1000이 아닌 player dependency를 생성 시점에 상태 변경 없이 거부한다', () => {
    const playerHealth = new PlayerHealthSystem(500, 400);

    expect(() => GameSession.create({ seed: 18 }, { playerHealth })).toThrow(RangeError);
    expect(playerHealth.currentHp).toBe(400);
    expect(playerHealth.maximumHp).toBe(500);
  });
});

class Harness extends GameSession {
  private constructor(seed: number, dependencies: GameSessionDependencies) {
    super(seed, EnemySystem.createDefault(), dependencies);
  }

  static createHarness(seed: number, dependencies: GameSessionDependencies = {}): Harness {
    return new Harness(seed, dependencies);
  }

  suppressWave(wave: 1 | 2 | 3 | 4 | 5): void {
    const definitions = WAVE_DEFINITIONS.map((definition) => ({
      wave: definition.wave,
      pathIds: definition.pathIds,
      groups: [],
    }));
    this.waves = new WaveSystem(definitions, this.rng, BALANCE.caps.enemies);
    this.waves.start(wave);
    this.waveStartEventPending = true;
  }

  spawnEnemy(kind: EnemyKind, pathId: PathId): number {
    return this.enemies.spawn({
      atMs: 0, kind, pathId, variant: 'male', spawnSequence: this.enemies.activeCount,
    });
  }

  place(enemyId: number, progress: number): void {
    this.enemies.applyPathProgress(enemyId, progress);
  }

  placeAt(enemyId: number, position: { readonly x: number; readonly y: number }): void {
    this.enemies.applyWorldPosition(enemyId, position);
  }

  weaken(enemyId: number, hp: number): void {
    const snapshot = this.enemies.snapshots().find(({ id }) => id === enemyId)!;
    this.enemies.damage(enemyId, snapshot.currentHp - hp);
  }

  learnAt(skillId: PurchasableSkillId, nowMs: number): void {
    this.skills.learn(skillId, nowMs);
  }

  setSimulationTicks(ticks: number): void {
    this.simulationTicks = ticks;
  }

  spawnProjectile(input: ProjectileSpawn): void {
    this.projectiles.spawn(input);
  }

  prepareActiveEnemiesForClear(): void {
    for (const enemy of this.enemies.snapshots()) {
      this.enemies.damage(enemy.id, Math.max(0, enemy.currentHp - 1));
      this.enemies.applyPathProgress(enemy.id, 1_000_000);
    }
  }
}

function steps(run: GameSession, count: number): GameEvent[] {
  return Array.from({ length: count }, () => run.step(FIXED_STEP_MS, PLAYER)).flat();
}

function stepsUntil(
  run: GameSession,
  predicate: (event: GameEvent) => boolean,
  maxSteps: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let tick = 0; tick < maxSteps; tick += 1) {
    const next = run.step(FIXED_STEP_MS, PLAYER);
    events.push(...next);
    if (next.some(predicate)) break;
  }
  return events;
}

function activeBossCount(run: GameSession): number {
  return run.snapshot().enemies.filter(({ isBoss }) => isBoss).length;
}

type AttackStartedTestEvent = {
  readonly type: 'attackStarted';
  readonly castId: string;
  readonly enemyId: number;
  readonly kind: EnemyKind;
};

function findAttackStarted(
  events: readonly GameEvent[],
): AttackStartedTestEvent | undefined {
  return events.find((event) => event.type === 'attackStarted') as
    | AttackStartedTestEvent
    | undefined;
}

function projectile(overrides: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    id: 1,
    castId: 'enemy:1:1',
    enemyId: 1,
    kind: 'poopGuardian',
    projectileKind: 'poop',
    from: { x: 20, y: 20 },
    to: PLAYER,
    speed: 1,
    damage: 25,
    lifeMs: 1200,
    ...overrides,
  };
}
