import {
  FIXED_STEP_MS,
  simulationMsFromTicks,
  TIME_EPSILON_MS,
} from '../constants';
import {
  BarkSystem,
  type BarkEvent,
  type BarkSnapshot,
} from '../combat/BarkSystem';
import { CombatSystem } from '../combat/CombatSystem';
import type { DamageCommand } from '../combat/CombatTypes';
import { EnemyAttackSystem } from '../combat/EnemyAttackSystem';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { selectThreatTarget } from '../combat/TargetingSystem';
import type { GameMode } from '../core/GameMode';
import { GameStateMachine } from '../core/GameStateMachine';
import { SeededRng } from '../core/SeededRng';
import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
import { EnemySystem, type EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import { ShelterSystem } from '../shelter/ShelterSystem';
import type { EnemyKind, SkillId, SkillLevel } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import { WaveSystem } from '../waves/WaveSystem';
import type { RunSnapshot } from './RunSnapshot';

const INITIAL_SKILLS = {
  bark: 1,
  scold: 0,
  aquaBeam: 0,
  deokbaeHowl: 0,
  safetyReport: 0,
} as const satisfies Readonly<Record<SkillId, SkillLevel>>;

const BARK_RANGE = 150;
const SCENARIO_WAVE_DEFINITIONS = [{ wave: 1, spawns: [] }] as const;

interface ActiveBarkAttack {
  readonly attackId: string;
  readonly targetId: number;
  readonly targetPosition: Point;
}

export class GameSession {
  private readonly stateMachine = new GameStateMachine('playing');
  private rng: SeededRng;
  private waves: WaveSystem;
  private readonly enemies = EnemySystem.createDefault();
  private readonly combat = new CombatSystem(this.enemies);
  private readonly bark = new BarkSystem(INITIAL_SKILLS.bark);
  private readonly attacks = createAttackSystems();
  private readonly projectiles = new ProjectileSystem(
    BALANCE.caps.projectiles,
    BALANCE.shelter.hitRadius,
  );
  private readonly shelter = new ShelterSystem(BALANCE.shelter.maxHp);
  private simulationTicks = 0;
  private snacks = 0;
  private nextBarkAttackSequence = 1;
  private nextProjectileId = 0;
  private activeBarkAttack: ActiveBarkAttack | null = null;
  private readonly eventBuffer: GameEvent[] = [];

  private constructor(seed: number) {
    assertSeed(seed);
    this.rng = new SeededRng(seed);
    this.waves = new WaveSystem(WAVE_DEFINITIONS, this.rng, BALANCE.caps.enemies);
    this.waves.start(1);
  }

  static create(input: { readonly seed: number }): GameSession {
    return new GameSession(input.seed);
  }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    assertFixedStep(stepMs);
    assertPlayer(player);
    if (!this.stateMachine.canStepWorld()) return this.flushEvents();

    this.simulationTicks += 1;
    const requests = this.waves.step(FIXED_STEP_MS, this.enemies.activeCount);
    for (const request of requests) {
      const enemyId = this.enemies.spawn(request);
      this.eventBuffer.push(
        { type: 'enemySpawnRequested', request },
        { type: 'enemySpawned', enemyId, request },
      );
    }
    this.enemies.step(FIXED_STEP_MS);
    const shelterDamage: number[] = [];
    this.stepEnemyAttacks(FIXED_STEP_MS, shelterDamage);
    this.stepProjectiles(FIXED_STEP_MS, shelterDamage);
    this.stepBark(player);
    for (const amount of shelterDamage) {
      this.eventBuffer.push(...this.shelter.damage(amount));
    }
    return this.flushEvents();
  }

  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(),
      simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current,
      pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.enemies.activeCount,
      activeProjectileCount: this.projectiles.activeCount,
      shelterHp: this.shelter.currentHp,
      snacks: this.snacks,
      enemies: this.enemies.snapshots(),
      projectiles: this.projectiles.snapshots(),
      skills: { ...INITIAL_SKILLS },
    };
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  barkSnapshot(): BarkSnapshot {
    return this.bark.snapshot();
  }

  barkCadenceMs(): number {
    return this.bark.cadenceDurationMs();
  }

  requestVisibilityPause(): void {
    this.stateMachine.hide();
  }

  requestVisibilityResume(): void {
    this.stateMachine.resume();
  }

  forceModeForTest(mode: GameMode): void {
    this.stateMachine.transition(mode);
  }

  modeStateForControllers(): GameStateMachine {
    return this.stateMachine;
  }

  spawnEnemyForScenario(seed: ScenarioEnemySeed): number {
    const spawned = this.enemies.spawnForScenario(seed);
    if (seed.stunnedMs !== undefined && seed.stunnedMs > 0) {
      const snapshot = this.enemies.snapshots().find(({ id }) => id === spawned.enemyId)!;
      this.attacks[seed.kind].stun(spawned.enemyId, seed.stunnedMs, snapshot.pathProgress);
    }
    return spawned.enemyId;
  }

  damageEnemy(enemyId: number, amount: number): readonly GameEvent[] {
    const events = this.enemies.damage(enemyId, amount);
    this.accumulateSnacks(events);
    return events;
  }

  stunEnemy(enemyId: number, durationMs: number): void {
    const enemy = this.enemies.snapshots().find(({ id }) => id === enemyId);
    this.enemies.stun(enemyId, durationMs);
    if (enemy !== undefined && durationMs > 0) {
      this.attacks[enemy.kind].stun(enemyId, durationMs, enemy.pathProgress);
    }
  }

  knockBackEnemy(enemyId: number, distance: number): void {
    const enemy = this.enemies.snapshots().find(({ id }) => id === enemyId);
    this.enemies.knockBack(enemyId, distance);
    if (enemy !== undefined && distance > 0) this.attacks[enemy.kind].interrupt(enemyId);
  }

  removeEnemyWithoutReward(enemyId: number): void {
    this.enemies.removeWithoutReward(enemyId);
    for (const attack of Object.values(this.attacks)) attack.remove(enemyId);
  }

  suppressWaveSpawnsForScenario(): void {
    this.waves = new WaveSystem(
      SCENARIO_WAVE_DEFINITIONS,
      this.rng,
      BALANCE.caps.enemies,
    );
    this.waves.start(1);
  }

  projectilePoolTelemetry(): PoolSnapshot {
    return this.projectiles.poolSnapshot();
  }

  reset(seed: number): void {
    assertSeed(seed);
    const rng = new SeededRng(seed);
    const waves = new WaveSystem(WAVE_DEFINITIONS, rng, BALANCE.caps.enemies);
    waves.start(1);

    this.stateMachine.reset('playing');
    this.rng = rng;
    this.waves = waves;
    this.enemies.clear();
    for (const attack of Object.values(this.attacks)) attack.clear();
    this.projectiles.clear();
    this.shelter.reset();
    this.bark.setLevel(INITIAL_SKILLS.bark);
    this.bark.reset();
    this.eventBuffer.length = 0;
    this.simulationTicks = 0;
    this.snacks = 0;
    this.nextBarkAttackSequence = 1;
    this.nextProjectileId = 0;
    this.activeBarkAttack = null;
  }

  private stepEnemyAttacks(stepMs: number, shelterDamage: number[]): void {
    for (const enemy of this.enemies.snapshots()) {
      const startedFromMoving = enemy.state === 'moving';
      for (const event of this.attacks[enemy.kind].step(stepMs, enemy)) {
        this.eventBuffer.push(event);
        if (event.type === 'attackStarted') {
          this.enemies.setState(event.enemyId, 'windup', startedFromMoving ? stepMs : 0);
        } else if (event.type === 'attackHolding') {
          this.enemies.setState(event.enemyId, 'holding');
        } else if (event.type === 'attackCancelled') {
          this.enemies.setState(event.enemyId, 'moving');
        } else if (event.type === 'shelterDamageRequested') {
          shelterDamage.push(event.damage);
        } else if (event.type === 'projectileRequested') {
          this.eventBuffer.push(...this.projectiles.spawn({
            id: this.nextProjectileId,
            kind: event.projectileKind,
            from: event.from,
            to: event.to,
            speed: event.speed,
            damage: event.damage,
            lifeMs: event.lifeMs,
          }));
          this.nextProjectileId += 1;
        }
      }
    }
  }

  private stepProjectiles(stepMs: number, shelterDamage: number[]): void {
    for (const event of this.projectiles.step(stepMs)) {
      this.eventBuffer.push(event);
      if (event.type === 'shelterDamageRequested') shelterDamage.push(event.damage);
    }
  }

  private stepBark(player: PlayerSnapshot): void {
    const enemies = this.enemies.snapshots();
    const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    const target = selectThreatTarget(player, enemies, BARK_RANGE);
    const barkEvents = this.bark.step(
      FIXED_STEP_MS,
      target,
      (enemyId) => this.enemies.has(enemyId),
    );
    const damageCommands: DamageCommand[] = [];

    for (const event of barkEvents) {
      this.handleBarkEvent(event, player, enemiesById, damageCommands);
    }

    const lifecycleEvents = this.combat.applyDamage(damageCommands);
    this.accumulateSnacks(lifecycleEvents);
    this.eventBuffer.push(...lifecycleEvents);
  }

  private handleBarkEvent(
    event: BarkEvent,
    player: PlayerSnapshot,
    enemiesById: ReadonlyMap<number, EnemySnapshot>,
    damageCommands: DamageCommand[],
  ): void {
    if (event.type === 'barkStarted') {
      const target = enemiesById.get(event.targetId);
      if (target === undefined) throw new Error('Bark started without an active target');
      const attackId = `bark:${this.nextBarkAttackSequence}`;
      this.nextBarkAttackSequence += 1;
      this.activeBarkAttack = {
        attackId,
        targetId: event.targetId,
        targetPosition: { ...target.position },
      };
      this.eventBuffer.push({ type: 'barkStarted', attackId, targetId: event.targetId });
      return;
    }

    const attack = this.activeBarkAttack;
    if (attack === null || attack.targetId !== event.targetId) {
      throw new Error('Bark release requires the active locked target');
    }
    if (event.type === 'barkReleased') {
      const targetPosition = enemiesById.get(event.targetId)?.position ?? attack.targetPosition;
      this.eventBuffer.push({
        type: 'barkReleased',
        attackId: attack.attackId,
        targetId: event.targetId,
        origin: { x: player.x, y: player.y },
        target: { ...targetPosition },
      });
      return;
    }

    damageCommands.push({
      attackId: attack.attackId,
      targetId: event.targetId,
      amount: event.amount,
    });
  }

  private accumulateSnacks(events: readonly EnemyLifecycleEvent[]): void {
    for (const event of events) {
      if (event.type === 'enemyDied') {
        for (const attack of Object.values(this.attacks)) attack.remove(event.enemyId);
      } else {
        this.snacks += event.amount;
      }
    }
  }

  private flushEvents(): readonly GameEvent[] {
    const events = this.eventBuffer.splice(0);
    return events;
  }
}

function createAttackSystems(): Record<EnemyKind, EnemyAttackSystem> {
  const shelter = {
    center: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
    radius: BALANCE.shelter.hitRadius,
  };
  return Object.fromEntries(
    (Object.keys(BALANCE.enemies) as EnemyKind[]).map((kind) => [
      kind,
      new EnemyAttackSystem({ kind, balance: BALANCE.enemies[kind], shelter }),
    ]),
  ) as Record<EnemyKind, EnemyAttackSystem>;
}

function assertSeed(seed: number): void {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('GameSession seed must be a safe integer');
  }
}

function assertFixedStep(stepMs: number): void {
  if (!Number.isFinite(stepMs) || Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
    throw new RangeError('GameSession requires one fixed step');
  }
}

function assertPlayer(player: PlayerSnapshot): void {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    throw new RangeError('GameSession player position must be finite');
  }
}
