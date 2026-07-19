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
import type { SkillId, SkillLevel } from '../types/GameTypes';
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
  private simulationTicks = 0;
  private snacks = 0;
  private nextBarkAttackSequence = 1;
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
    this.stepBark(player);
    return this.flushEvents();
  }

  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(),
      simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current,
      pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.enemies.activeCount,
      activeProjectileCount: 0,
      shelterHp: BALANCE.shelter.maxHp,
      snacks: this.snacks,
      enemies: this.enemies.snapshots(),
      skills: { ...INITIAL_SKILLS },
    };
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  barkSnapshot(): BarkSnapshot {
    return this.bark.snapshot();
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
    return this.enemies.spawnForScenario(seed).enemyId;
  }

  damageEnemy(enemyId: number, amount: number): readonly GameEvent[] {
    const events = this.enemies.damage(enemyId, amount);
    this.accumulateSnacks(events);
    return events;
  }

  removeEnemyWithoutReward(enemyId: number): void {
    this.enemies.removeWithoutReward(enemyId);
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
    this.bark.setLevel(INITIAL_SKILLS.bark);
    this.bark.reset();
    this.eventBuffer.length = 0;
    this.simulationTicks = 0;
    this.snacks = 0;
    this.nextBarkAttackSequence = 1;
    this.activeBarkAttack = null;
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
      if (event.type === 'snackEarned') this.snacks += event.amount;
    }
  }

  private flushEvents(): readonly GameEvent[] {
    const events = this.eventBuffer.splice(0);
    return events;
  }
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
