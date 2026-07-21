import { BarkSystem } from '../combat/BarkSystem';
import { CombatSystem } from '../combat/CombatSystem';
import type {
  CombatEvent,
  DamageCommand,
  EnemyDamageResult,
} from '../combat/CombatTypes';
import {
  EnemyAttackSystem,
  type AttackOriginResolver,
  type ShelterDamageRequest,
} from '../combat/EnemyAttackSystem';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { CompanionSystem } from '../companions/CompanionSystem';
import { FIXED_STEP_MS, simulationMsFromTicks } from '../constants';
import type { GameMode } from '../core/GameMode';
import { GameStateMachine } from '../core/GameStateMachine';
import { SeededRng } from '../core/SeededRng';
import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import { EnemySystem, type EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import {
  assertPurchasableSkillId,
  ProgressionSystem,
  skillPurchaseCost,
} from '../progression/ProgressionSystem';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import { ShelterSystem } from '../shelter/ShelterSystem';
import {
  AUTO_SKILL_IDS,
  damageCommandsForSkillImpact,
  SkillSystem,
  tailEffectFor,
} from '../skills/SkillSystem';
import { impactStrengthFor } from '../skills/skillDefinitions';
import type { EnemyKind, PurchasableSkillId } from '../types/GameTypes';
import { UiTransitionClock } from '../ui/UiTransitionClock';
import type { Point } from '../world/Geometry';
import { WaveSystem } from '../waves/WaveSystem';
import type { RunSnapshot, WaveNumber } from './RunSnapshot';
import { RunOutcomeResolver } from './RunOutcomeResolver';

const BARK_DAMAGE = 18;
const COMPANION_DAMAGE = 11;
const LOST_RESULT_MS = 1200;

type CountdownTransition = 'nextWave' | 'lostResult';

interface ActiveEnemyAttack {
  readonly castId: string;
  readonly kind: EnemyKind;
}

export interface GameSessionDependencies {
  readonly progression?: ProgressionSystem;
  readonly shelter?: ShelterSystem;
  readonly projectileOriginByKind?: Partial<Record<EnemyKind, AttackOriginResolver>>;
}

export class GameSession {
  protected readonly stateMachine = new GameStateMachine('playing');
  protected rng: SeededRng;
  protected waves: WaveSystem;
  protected readonly enemies: EnemySystem;
  protected readonly combat: CombatSystem;
  protected readonly bark = new BarkSystem();
  protected readonly companion = new CompanionSystem();
  protected readonly attacks: Record<EnemyKind, EnemyAttackSystem>;
  protected readonly projectiles = new ProjectileSystem(
    BALANCE.caps.projectiles,
    BALANCE.shelter.hitRadius,
  );
  protected readonly shelter: ShelterSystem;
  protected readonly skills = new SkillSystem();
  protected readonly progression: ProgressionSystem;
  protected readonly uiClock = new UiTransitionClock(0);
  protected readonly outcomes = new RunOutcomeResolver();
  protected simulationTicks = 0;
  protected uiTransition: CountdownTransition | null = null;
  protected nextProjectileId = 0;
  protected waveStartEventPending = true;
  protected readonly eventBuffer: GameEvent[] = [];

  private readonly activeEnemyAttacks = new Map<number, ActiveEnemyAttack>();
  private combatSnapshots = new Map<number, EnemySnapshot>();
  private activeBossCount = 0;

  protected constructor(
    seed: number,
    enemies = EnemySystem.createDefault(),
    dependencies: GameSessionDependencies = {},
  ) {
    assertSeed(seed);
    const shelter = dependencies.shelter ?? new ShelterSystem(BALANCE.shelter.maxHp);
    if (shelter.maximumHp !== BALANCE.shelter.maxHp) {
      throw new RangeError(
        `GameSession shelter maximumHp must be ${BALANCE.shelter.maxHp}`,
      );
    }
    this.enemies = enemies;
    this.progression = dependencies.progression ?? new ProgressionSystem();
    this.shelter = shelter;
    const learned = this.progression.snapshot().learned;
    for (const skillId of AUTO_SKILL_IDS) {
      if (learned[skillId]) this.skills.learn(skillId, 0);
    }
    this.combat = new CombatSystem({
      damage: (targetId, amount) => this.damageEnemy(targetId, amount),
    });
    this.attacks = createAttackSystems(dependencies.projectileOriginByKind);
    this.rng = new SeededRng(seed);
    this.waves = this.createWaves(this.rng);
  }

  static create(
    input: { readonly seed: number },
    dependencies: GameSessionDependencies = {},
  ): GameSession {
    return new GameSession(input.seed, EnemySystem.createDefault(), dependencies);
  }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    assertFixedStep(stepMs);
    assertPlayer(player);
    if (!this.stateMachine.canStepWorld()) return this.stepNonWorld(stepMs);

    this.simulationTicks += 1;
    const appliedAtStep = this.simulationTicks;

    this.consumePurchase();
    if (this.waveStartEventPending) {
      this.waveStartEventPending = false;
      this.eventBuffer.push({ type: 'waveStarted', wave: this.currentWave() });
    }
    this.spawnWaveRequests();
    this.enemies.step(FIXED_STEP_MS);

    const damageCommands = this.collectPlayerDamage(player);
    const snapshotsBeforeDamage = this.enemies.snapshots();
    this.combatSnapshots = new Map(snapshotsBeforeDamage.map((enemy) => [enemy.id, enemy]));
    try {
      const combatEvents = this.combat.applyDamage(damageCommands, appliedAtStep);
      this.applyCombatEvents(combatEvents);
    } finally {
      this.combatSnapshots.clear();
    }

    const shelterRequests: ShelterDamageRequest[] = [];
    this.stepEnemyAttacks(shelterRequests);
    this.stepProjectiles(shelterRequests);
    this.applyShelterDamage(shelterRequests, appliedAtStep);

    this.resolvePostStepOutcome();
    this.refreshBossActiveEvent();
    return this.flushEvents();
  }

  queueSkillPurchase(skillId: PurchasableSkillId): SkillPurchaseResult {
    if (this.stateMachine.current() === 'playing') {
      return this.progression.queuePurchase(skillId);
    }
    assertPurchasableSkillId(skillId);
    const snapshot = this.progression.snapshot();
    return {
      status: 'queueBusy',
      skillId,
      cost: skillPurchaseCost(skillId, snapshot.nextCost),
      spent: 0,
      snacks: snapshot.snacks,
      nextCost: snapshot.nextCost,
    };
  }

  snapshot(): RunSnapshot {
    const progression = this.progression.snapshot();
    const projectiles = this.projectiles.snapshots();
    return {
      mode: this.stateMachine.current(),
      simulationMs: this.simulationTimeMs(),
      wave: this.currentWave(),
      shelterHp: this.shelter.currentHp,
      shelterMaxHp: BALANCE.shelter.maxHp,
      snacks: progression.snacks,
      nextSkillCost: progression.nextCost,
      learnedSkills: { ...progression.learned },
      skillStates: {
        tailSwipe: this.skills.snapshot('tailSwipe'),
        aquaBeam: this.skills.snapshot('aquaBeam'),
        safetyReport: this.skills.snapshot('safetyReport'),
      },
      companion: this.companion.snapshot(),
      enemies: this.enemies.snapshots(),
      projectiles,
      activeEnemyCount: this.enemies.activeCount,
      pendingSpawns: this.waves.pendingCount,
      activeProjectileCount: projectiles.length,
    };
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  simulationTimeMs(): number {
    return simulationMsFromTicks(this.simulationTicks);
  }

  countdownState(): {
    readonly kind: CountdownTransition | null;
    readonly remainingMs: number;
  } {
    return {
      kind: this.uiTransition,
      remainingMs: this.uiTransition === null ? 0 : this.uiClock.remainingMs,
    };
  }

  requestVisibilityPause(): void {
    const before = this.stateMachine.current();
    this.stateMachine.hide();
    if (this.stateMachine.current() !== before) this.uiClock.pause();
  }

  requestVisibilityResume(): void {
    if (this.stateMachine.current() !== 'visibilityPause') return;
    this.stateMachine.resume();
    this.uiClock.resume();
  }

  modeStateForControllers(): GameStateMachine {
    return this.stateMachine;
  }

  reset(seed: number): void {
    assertSeed(seed);
    const rng = new SeededRng(seed);
    const waves = this.createWaves(rng);

    this.stateMachine.reset('playing');
    this.rng = rng;
    this.waves = waves;
    this.enemies.clear();
    for (const attack of Object.values(this.attacks)) attack.clear();
    this.projectiles.clear();
    this.shelter.reset();
    this.progression.reset();
    this.bark.reset();
    this.companion.reset();
    this.skills.reset();
    this.uiClock.restart(0);
    this.outcomes.reset();
    this.eventBuffer.length = 0;
    this.activeEnemyAttacks.clear();
    this.combatSnapshots.clear();
    this.simulationTicks = 0;
    this.uiTransition = null;
    this.nextProjectileId = 0;
    this.waveStartEventPending = true;
    this.activeBossCount = 0;
  }

  protected flushEvents(): readonly GameEvent[] {
    return this.eventBuffer.splice(0);
  }

  protected resolvePostStepOutcome(): void {
    const resolution = this.outcomes.resolve({
      shelterHp: this.shelter.currentHp,
      wave: this.currentWave(),
      active: this.enemies.activeCount,
      pending: this.waves.pendingCount,
    });
    if (resolution.mode === 'lost' || resolution.mode === 'won') {
      this.finish(resolution.mode);
      return;
    }
    if (resolution.mode === 'countdown') {
      this.waves.setPendingNext(resolution.nextWave);
      this.beginNextWaveCountdown(resolution.nextWave);
    }
  }

  private createWaves(rng: SeededRng): WaveSystem {
    const waves = new WaveSystem(WAVE_DEFINITIONS, rng, BALANCE.caps.enemies);
    waves.start(1);
    return waves;
  }

  private consumePurchase(): void {
    const purchase = this.progression.consumeQueuedPurchase();
    if (purchase?.status !== 'learned') return;
    this.skills.learn(purchase.skillId, this.simulationTimeMs());
    this.eventBuffer.push({
      type: 'skillPurchaseResolved',
      result: { ...purchase, status: 'learned' },
    });
  }

  private spawnWaveRequests(): void {
    const requests = this.waves.step(FIXED_STEP_MS, this.enemies.activeCount);
    for (const request of requests) {
      const enemyId = this.enemies.spawn(request);
      this.eventBuffer.push(
        { type: 'enemySpawnRequested', request },
        { type: 'enemySpawned', enemyId, request },
      );
    }
  }

  private collectPlayerDamage(player: PlayerSnapshot): DamageCommand[] {
    const origin = { x: player.x, y: player.y };
    const enemies = this.enemies.snapshots();
    const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    const commands: DamageCommand[] = [];

    for (const event of this.bark.step(FIXED_STEP_MS, { origin, enemies })) {
      this.eventBuffer.push(event);
      if (event.type !== 'barkImpact') continue;
      for (const targetId of event.targetIds) {
        const target = enemiesById.get(targetId);
        if (target === undefined) continue;
        commands.push({
          castId: event.castId,
          targetId,
          amount: BARK_DAMAGE,
          impactDirection: normalizedDirection(event.origin, target.position),
          source: 'bark',
          strength: impactStrengthFor('bark'),
        });
      }
    }

    for (const event of this.companion.step(FIXED_STEP_MS, { player: origin, enemies })) {
      this.eventBuffer.push(event);
      if (event.type !== 'companionAttack') continue;
      commands.push({
        castId: event.castId,
        targetId: event.targetId,
        amount: COMPANION_DAMAGE,
        impactDirection: normalizedDirection(event.origin, event.targetPosition),
        source: 'deokbae',
        strength: impactStrengthFor('deokbae'),
      });
    }

    for (const event of this.skills.step(this.simulationTimeMs(), { player: origin, enemies })) {
      this.eventBuffer.push(event);
      if (event.type === 'skillImpact') {
        commands.push(...damageCommandsForSkillImpact(event, enemies));
      }
    }
    return commands;
  }

  private damageEnemy(targetId: number, amount: number): EnemyDamageResult {
    const fallback = this.combatSnapshots.get(targetId);
    const before = this.enemies.snapshots().find(({ id }) => id === targetId);
    if (before === undefined) {
      if (fallback === undefined) throw new Error(`Unknown combat target ${targetId}`);
      return {
        effectiveAmount: 0,
        position: { ...fallback.position },
        lethal: true,
        lifecycleEvents: [],
      };
    }
    const lifecycleEvents = this.enemies.damage(targetId, amount);
    return {
      effectiveAmount: Math.min(Math.max(0, amount), before.currentHp),
      position: { ...before.position },
      lethal: !this.enemies.has(targetId),
      lifecycleEvents,
    };
  }

  private applyCombatEvents(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.type === 'damageApplied') {
        this.eventBuffer.push(event);
        if (event.source === 'tailSwipe' && !event.lethal) {
          this.applyTailEffect(event.targetId);
        }
        continue;
      }
      this.applyLifecycleEvent(event);
    }
  }

  private applyTailEffect(enemyId: number): void {
    const enemy = this.combatSnapshots.get(enemyId);
    if (enemy === undefined || !this.enemies.has(enemyId)) return;
    const result = this.enemies.applyTailEffect(enemyId, tailEffectFor(enemy.isBoss));
    if (!result.interruptedWindup) return;

    const active = this.activeEnemyAttacks.get(enemyId);
    if (!this.attacks[enemy.kind].interruptWindup(enemyId)) return;
    if (active !== undefined) {
      this.eventBuffer.push({
        type: 'attackCancelled',
        castId: active.castId,
        enemyId,
        kind: active.kind,
      });
    }
    this.activeEnemyAttacks.delete(enemyId);
  }

  private applyLifecycleEvent(event: EnemyLifecycleEvent): void {
    const enemy = this.combatSnapshots.get(event.enemyId);
    if (enemy === undefined) throw new Error(`Missing lifecycle snapshot ${event.enemyId}`);
    if (event.type === 'enemyDied') {
      this.attacks[enemy.kind].remove(event.enemyId);
      this.activeEnemyAttacks.delete(event.enemyId);
      this.eventBuffer.push({
        type: 'enemyDied',
        enemyId: event.enemyId,
        kind: enemy.kind,
        position: { ...enemy.position },
      });
      return;
    }
    this.progression.addSnacks(event.amount);
    this.eventBuffer.push({
      type: 'snackEarned',
      enemyId: event.enemyId,
      kind: enemy.kind,
      amount: event.amount,
      snacks: this.progression.snapshot().snacks,
    });
  }

  private stepEnemyAttacks(shelterRequests: ShelterDamageRequest[]): void {
    for (const enemy of this.enemies.snapshots()) {
      const attack = this.attacks[enemy.kind];
      let cancelled = false;
      for (const event of attack.step(FIXED_STEP_MS, enemy)) {
        this.eventBuffer.push(event);
        if (event.type === 'attackStarted') {
          this.activeEnemyAttacks.set(enemy.id, { castId: event.castId, kind: event.kind });
        } else if (event.type === 'attackCancelled') {
          cancelled = true;
          this.activeEnemyAttacks.delete(enemy.id);
        } else if (event.type === 'shelterDamageRequested') {
          shelterRequests.push(event);
        } else if (event.type === 'projectileRequested') {
          this.projectiles.spawn({
            id: this.nextProjectileId,
            castId: event.castId,
            enemyId: event.enemyId,
            kind: event.kind,
            projectileKind: event.projectileKind,
            from: event.from,
            to: event.to,
            speed: event.speed,
            damage: event.damage,
            lifeMs: event.lifeMs,
          });
          this.nextProjectileId += 1;
        }
      }

      const attackState = attack.snapshot(enemy.id);
      if (attackState.state === 'windup' || attackState.state === 'holding') {
        this.enemies.setState(enemy.id, attackState.state, attackState.animationElapsedMs);
      } else if (cancelled) {
        this.enemies.setState(enemy.id, 'moving', 0);
      }
    }
  }

  private stepProjectiles(shelterRequests: ShelterDamageRequest[]): void {
    for (const event of this.projectiles.step(FIXED_STEP_MS)) {
      if (event.type === 'projectileSpawned' || event.type === 'projectileDropped') continue;
      this.eventBuffer.push(event);
      if (event.type === 'shelterDamageRequested') shelterRequests.push(event);
    }
  }

  private applyShelterDamage(
    requests: readonly ShelterDamageRequest[],
    appliedAtStep: number,
  ): void {
    for (const request of requests) {
      const before = this.shelter.currentHp;
      const [result] = this.shelter.damage(request.amount);
      const effectiveAmount = before - this.shelter.currentHp;
      if (result === undefined || effectiveAmount <= 0) continue;
      this.eventBuffer.push({
        type: 'shelterDamaged',
        castId: request.castId,
        appliedAtStep,
        sourceEnemyId: request.sourceEnemyId,
        sourceEnemyKind: request.sourceEnemyKind,
        amount: request.amount,
        effectiveAmount,
        hp: this.shelter.currentHp,
        maxHp: BALANCE.shelter.maxHp,
        position: { ...request.position },
        impactDirection: { ...request.impactDirection },
        strength: request.strength,
        visual: result.visual,
      });
    }
  }

  private refreshBossActiveEvent(): void {
    const nextCount = this.enemies.snapshots().filter(({ isBoss }) => isBoss).length;
    if ((this.activeBossCount === 0) === (nextCount === 0)) {
      this.activeBossCount = nextCount;
      return;
    }
    this.activeBossCount = nextCount;
    this.eventBuffer.push({
      type: 'bossActiveChanged',
      active: nextCount > 0,
      activeBossCount: nextCount,
    });
  }

  private beginNextWaveCountdown(nextWave: Exclude<WaveNumber, 1>): void {
    const fromWave = this.currentWave();
    if (fromWave === 5) throw new Error('Final wave cannot start a countdown');
    this.uiTransition = 'nextWave';
    this.uiClock.restart(BALANCE.waveCountdownMs);
    this.stateMachine.transition('countdown');
    this.eventBuffer.push(
      { type: 'modeChanged', mode: 'countdown' },
      { type: 'waveTransition', fromWave, toWave: nextWave, countdownMs: 3000 },
      { type: 'waveCountdownChanged', remainingMs: this.uiClock.remainingMs },
    );
  }

  private finish(outcome: 'won' | 'lost'): void {
    if (this.stateMachine.current() === 'won' || this.stateMachine.current() === 'lost') return;
    this.stateMachine.transition(outcome);
    this.eventBuffer.push(
      { type: 'modeChanged', mode: outcome },
      { type: 'runEnded', outcome },
    );
    if (outcome === 'lost') {
      this.uiTransition = 'lostResult';
      this.uiClock.restart(LOST_RESULT_MS);
    } else {
      this.eventBuffer.push({ type: 'resultReady', outcome: 'won' });
    }
  }

  private stepNonWorld(stepMs: number): readonly GameEvent[] {
    const mode = this.stateMachine.current();
    if ((mode !== 'countdown' && mode !== 'lost') || this.uiTransition === null) {
      return this.flushEvents();
    }
    if (this.uiClock.step(stepMs, mode) !== 'completed') {
      if (mode === 'countdown') {
        this.eventBuffer.push({
          type: 'waveCountdownChanged',
          remainingMs: this.uiClock.remainingMs,
        });
      }
      return this.flushEvents();
    }

    const completed = this.uiTransition;
    this.uiTransition = null;
    if (completed === 'lostResult') {
      this.eventBuffer.push({ type: 'resultReady', outcome: 'lost' });
      return this.flushEvents();
    }
    const wave = this.waves.startPendingNext();
    this.stateMachine.transition('playing');
    this.eventBuffer.push(
      { type: 'waveStarted', wave: asWaveNumber(wave) },
      { type: 'modeChanged', mode: 'playing' },
    );
    return this.flushEvents();
  }

  private currentWave(): WaveNumber {
    return asWaveNumber(this.waves.current);
  }
}

function createAttackSystems(
  projectileOriginByKind: GameSessionDependencies['projectileOriginByKind'] = {},
): Record<EnemyKind, EnemyAttackSystem> {
  const shelter = {
    center: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
    radius: BALANCE.shelter.hitRadius,
  };
  return Object.fromEntries(
    (Object.keys(BALANCE.enemies) as EnemyKind[]).map((kind) => [
      kind,
      new EnemyAttackSystem({
        kind,
        balance: BALANCE.enemies[kind],
        shelter,
        projectileOrigin: projectileOriginByKind[kind],
      }),
    ]),
  ) as Record<EnemyKind, EnemyAttackSystem>;
}

function normalizedDirection(origin: Point, target: Point): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length };
}

function asWaveNumber(wave: number): WaveNumber {
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > 5) {
    throw new Error(`Invalid session wave ${String(wave)}`);
  }
  return wave as WaveNumber;
}

function assertSeed(seed: number): void {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('GameSession seed must be a safe integer');
  }
}

function assertFixedStep(stepMs: number): void {
  if (!Number.isFinite(stepMs) || stepMs !== FIXED_STEP_MS) {
    throw new RangeError('GameSession requires one exact fixed step');
  }
}

function assertPlayer(player: PlayerSnapshot): void {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    throw new RangeError('GameSession player position must be finite');
  }
}
